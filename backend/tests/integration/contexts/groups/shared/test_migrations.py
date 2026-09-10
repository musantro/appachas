from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from typing import Any

import psycopg
import pytest
from psycopg.rows import dict_row

from appachas.contexts.groups.identity_claim.application.handler import (
    ClaimIdentity,
    ClaimIdentityHandler,
)
from appachas.contexts.groups.identity_claim.application.session import StartSessionHandler
from appachas.contexts.groups.member_management.application.handlers import ReleaseMemberHandler
from appachas.contexts.groups.session_migration.application.handlers import (
    AuthorizeMigrationHandler,
    ConfirmMigrationHandler,
    RedeemMigrationHandler,
    StartMigrationHandler,
)
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Conflict, Forbidden
from appachas.contexts.groups.shared.infrastructure.persistence.repository import (
    PostgresRepository,
    PostgresUnitOfWork,
)
from appachas.infrastructure.bootstrap.adapters import SecureTokens, token_hash
from tests.integration.contexts.groups.shared.test_postgres import database as database
from tests.integration.contexts.groups.shared.test_postgres import (
    persisted_group as persisted_group,
)
from tests.mothers import FrozenClock

pytestmark = pytest.mark.integration
SOURCE = "https://appachas.vercel.app"
TARGET = "https://appachas.es"


@pytest.fixture(params=[False, True], ids=["member", "creator"])
def migration_database(persisted_group, request):
    url, connection, group, creator_hash, member_hash = persisted_group
    clock = FrozenClock()
    tokens = SecureTokens()
    creator = request.param

    def factory():
        return PostgresUnitOfWork(connection)

    if creator:
        session = StartSessionHandler(factory, clock, tokens).handle(Access(creator_hash))
    else:
        session = ClaimIdentityHandler(factory, clock, tokens).handle(
            ClaimIdentity(Access(member_hash), group.members[1].id)
        )
    assert session.session_token is not None
    source = Access(session_hash=token_hash(session.session_token), group_id=group.id)
    target = Access(group_id=group.id)

    def operation(cls, current=connection):
        return cls(lambda: PostgresUnitOfWork(current), clock, tokens, SOURCE, TARGET)

    start = operation(StartMigrationHandler).handle(target)
    code = operation(AuthorizeMigrationHandler).handle(source, start.id)
    yield url, connection, group, source, target, start, code, operation


def redeem(migration_database):
    _, _, _, _, target, start, code, operation = migration_database
    raw = operation(RedeemMigrationHandler).handle(
        target, start.id, token_hash(start.binding_token), token_hash(code)
    )
    return Access(session_hash=token_hash(raw), group_id=target.group_id)


def test_persisted_pending_cookie_is_inactive_until_atomic_confirmation(migration_database):
    # Arrange / Given
    _, connection, group, source, _, start, code, operation = migration_database
    repository = PostgresRepository(connection)
    original = repository.session_actor(group.id, source.session_hash)
    assert original is not None
    pending = redeem(migration_database)
    row = connection.execute(
        "SELECT * FROM appachas.session_migrations WHERE id=%s", (start.id,)
    ).fetchone()
    assert row is not None
    assert row["code_hash"] == token_hash(code)
    assert row["binding_hash"] == token_hash(start.binding_token)
    assert code not in str(row) and start.binding_token not in str(row)
    assert repository.session_actor(group.id, source.session_hash) == original
    assert repository.session_actor(group.id, pending.session_hash) is None

    # Act / When
    result = operation(ConfirmMigrationHandler).handle(
        pending, start.id, token_hash(start.binding_token)
    )

    # Assert / Then
    assert result.actor == original
    assert repository.session_actor(group.id, source.session_hash) is None
    assert repository.session_actor(group.id, pending.session_hash) == original
    rows = connection.execute(
        "SELECT token_hash FROM appachas.sessions WHERE group_id=%s AND revoked_at IS NULL",
        (group.id,),
    ).fetchall()
    assert [row["token_hash"] for row in rows] == [pending.session_hash]
    assert result.group.member(original.member_id).claimed


def test_concurrent_redemption_consumes_a_code_exactly_once(migration_database):
    # Arrange / Given
    url, _, _, _, target, start, code, operation = migration_database
    barrier = Barrier(2)

    def attempt():
        with psycopg.Connection[dict[str, Any]].connect(
            url, autocommit=True, row_factory=dict_row
        ) as current:
            barrier.wait(timeout=5)
            try:
                operation(RedeemMigrationHandler, current).handle(
                    target, start.id, token_hash(start.binding_token), token_hash(code)
                )
                return "redeemed"
            except Conflict as error:
                return error.code

    # Act / When
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: attempt(), range(2)))

    # Assert / Then
    assert sorted(outcomes) == ["migration_used", "redeemed"]


def test_concurrent_confirmation_is_idempotent_without_two_active_sessions(migration_database):
    # Arrange / Given
    url, connection, group, _, _, start, _, operation = migration_database
    pending = redeem(migration_database)
    barrier = Barrier(2)

    def attempt():
        with psycopg.Connection[dict[str, Any]].connect(
            url, autocommit=True, row_factory=dict_row
        ) as current:
            barrier.wait(timeout=5)
            return (
                operation(ConfirmMigrationHandler, current)
                .handle(pending, start.id, token_hash(start.binding_token))
                .actor
            )

    # Act / When
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: attempt(), range(2)))

    # Assert / Then
    assert outcomes[0] == outcomes[1]
    rows = connection.execute(
        "SELECT token_hash FROM appachas.sessions WHERE group_id=%s AND revoked_at IS NULL",
        (group.id,),
    ).fetchall()
    assert [row["token_hash"] for row in rows] == [pending.session_hash]


def test_two_handoffs_from_one_session_cannot_both_activate(migration_database):
    # Arrange / Given
    url, connection, group, source, target, start, _, operation = migration_database
    pending = redeem(migration_database)
    other_start = operation(StartMigrationHandler).handle(target)
    other_code = operation(AuthorizeMigrationHandler).handle(source, other_start.id)
    other_pending = operation(RedeemMigrationHandler).handle(
        target, other_start.id, token_hash(other_start.binding_token), token_hash(other_code)
    )
    attempts = [
        (pending, start),
        (Access(session_hash=token_hash(other_pending), group_id=group.id), other_start),
    ]
    barrier = Barrier(2)

    def attempt(arguments):
        access, migration = arguments
        with psycopg.Connection[dict[str, Any]].connect(
            url, autocommit=True, row_factory=dict_row
        ) as current:
            barrier.wait(timeout=5)
            try:
                operation(ConfirmMigrationHandler, current).handle(
                    access, migration.id, token_hash(migration.binding_token)
                )
                return "confirmed"
            except Forbidden as error:
                return error.code

    # Act / When
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, attempts))

    # Assert / Then
    assert sorted(outcomes) == ["confirmed", "migration_invalid"]
    rows = connection.execute(
        "SELECT token_hash FROM appachas.sessions WHERE group_id=%s AND revoked_at IS NULL",
        (group.id,),
    ).fetchall()
    assert len(rows) == 1


def test_confirmation_database_failure_preserves_the_source_session(
    migration_database, monkeypatch
):
    # Arrange / Given
    _, connection, group, source, _, start, _, operation = migration_database
    pending = redeem(migration_database)
    repository = PostgresRepository(connection)
    before = repository.get_by_id(group.id, lock=False)

    def fail(self, session):
        raise RuntimeError("simulated database failure")

    # Act / When
    with monkeypatch.context() as scoped:
        scoped.setattr(PostgresRepository, "save_session", fail)
        with pytest.raises(RuntimeError):
            operation(ConfirmMigrationHandler).handle(
                pending, start.id, token_hash(start.binding_token)
            )

    # Assert / Then
    assert repository.session_actor(group.id, source.session_hash) is not None
    assert repository.session_actor(group.id, pending.session_hash) is None
    assert repository.get_by_id(group.id, lock=False) == before
    migration = repository.get_migration(group.id, start.id)
    assert migration is not None and migration.confirmed_at is None


def test_migration_request_purge_does_not_remove_active_source_sessions(migration_database):
    # Arrange / Given
    _, connection, group, source, _, start, _, _ = migration_database
    repository = PostgresRepository(connection)

    # Act / When
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.purge_migrations(FrozenClock().now() + timedelta(seconds=120), group.id)

    # Assert / Then
    assert repository.get_migration(group.id, start.id) is None
    assert repository.session_actor(group.id, source.session_hash) is not None


def test_group_deletion_cascades_pending_session_migrations(migration_database):
    # Arrange / Given
    _, connection, group, _, _, start, _, _ = migration_database
    redeem(migration_database)

    # Act / When
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.delete_group(group.id)

    # Assert / Then
    assert PostgresRepository(connection).get_migration(group.id, start.id) is None


def test_releasing_member_prevents_later_pending_migration_activation(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, member_hash = persisted_group
    clock = FrozenClock()
    tokens = SecureTokens()

    def factory():
        return PostgresUnitOfWork(connection)

    claimed = ClaimIdentityHandler(factory, clock, tokens).handle(
        ClaimIdentity(Access(member_hash), group.members[1].id)
    )
    member = claimed.group.members[1]
    source = Access(session_hash=token_hash(claimed.session_token), group_id=group.id)
    target = Access(group_id=group.id)
    start = StartMigrationHandler(factory, clock, tokens, SOURCE, TARGET).handle(target)
    code = AuthorizeMigrationHandler(factory, clock, tokens, SOURCE, TARGET).handle(
        source, start.id
    )
    pending_raw = RedeemMigrationHandler(factory, clock, tokens, SOURCE, TARGET).handle(
        target, start.id, token_hash(start.binding_token), token_hash(code)
    )
    ReleaseMemberHandler(factory, clock).handle(Access(creator_hash), member.id, member.version)

    # Act / When
    with pytest.raises(Forbidden) as error:
        ConfirmMigrationHandler(factory, clock, tokens, SOURCE, TARGET).handle(
            Access(session_hash=token_hash(pending_raw), group_id=group.id),
            start.id,
            token_hash(start.binding_token),
        )

    # Assert / Then
    assert error.value.code == "migration_invalid"
    restored = PostgresRepository(connection).get_by_id(group.id, lock=False)
    assert restored is not None and not restored.member(member.id).claimed
