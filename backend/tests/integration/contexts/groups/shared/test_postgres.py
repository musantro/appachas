import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from threading import Barrier
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import psycopg
import pytest
from psycopg.rows import dict_row

from appachas.contexts.groups.identity_claim.application.handler import (
    ClaimIdentity,
    ClaimIdentityHandler,
)
from appachas.contexts.groups.identity_claim.application.session import StartSessionHandler
from appachas.contexts.groups.lifecycle.application.handlers import ExpireGroupsHandler
from appachas.contexts.groups.member_management.application.handlers import ReleaseMemberHandler
from appachas.contexts.groups.movement_management.domain.rules import MovementInput, build_movement
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Conflict
from appachas.contexts.groups.shared.infrastructure.persistence.repository import (
    PostgresRepository,
    PostgresUnitOfWork,
)
from appachas.infrastructure.bootstrap.adapters import SecureTokens
from tests.mothers import FrozenClock, GroupMother

pytestmark = pytest.mark.integration


@pytest.fixture
def database():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL must point to an isolated PostgreSQL database")
    if urlsplit(url).hostname not in ("localhost", "127.0.0.1", "postgres"):
        pytest.fail("Integration tests only use an isolated local PostgreSQL database")
    with psycopg.Connection[dict[str, Any]].connect(
        url, autocommit=True, row_factory=dict_row
    ) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()
        yield url, connection


def test_alembic_metadata_is_not_exposed_by_default(database):
    _, connection = database
    table = connection.execute(
        """
        SELECT c.relrowsecurity
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'alembic_version'
        """
    ).fetchone()
    assert table is not None and table["relrowsecurity"]

    public_privileges = connection.execute(
        """
        SELECT count(*) AS privilege_count
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(
            COALESCE(c.relacl, acldefault('r', c.relowner))
        ) AS acl
        WHERE n.nspname = 'public'
          AND c.relname = 'alembic_version'
          AND acl.grantee = 0
        """
    ).fetchone()
    assert public_privileges is not None
    assert public_privileges["privilege_count"] == 0

    public_default_privileges = connection.execute(
        """
        SELECT count(*) AS privilege_count
        FROM pg_default_acl AS d
        JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
        CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
        WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
          AND n.nspname = 'public'
          AND d.defaclobjtype = 'r'
          AND acl.grantee = 0
        """
    ).fetchone()
    assert public_default_privileges is not None
    assert public_default_privileges["privilege_count"] == 0


@pytest.fixture
def persisted_group(database):
    url, connection = database
    group = GroupMother.with_members()
    group.id = str(uuid4())
    for member in group.members:
        member.id = str(uuid4())
    group.creator_member_id = group.members[0].id
    creator_hash, member_hash = uuid4().hex, uuid4().hex
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.create(group, creator_hash, member_hash)
    yield url, connection, group, creator_hash, member_hash
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.delete_group(group.id)


def test_group_and_positive_allocations_round_trip_in_normalized_tables(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, _ = persisted_group
    data = MovementInput(
        "refund",
        1001,
        "Reserva",
        date(2026, 9, 10),
        group.members[0].id,
        [m.id for m in group.members],
    )
    movement = build_movement(
        group, data, today=data.date, now=FrozenClock().now(), identifier=str(uuid4())
    )
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.save_movement(group.id, movement)
    # Act / When
    with PostgresUnitOfWork(connection) as uow:
        restored, is_creator = uow.repository.get(creator_hash, lock=False)
    # Assert / Then
    assert is_creator
    assert restored.movements == [movement]
    assert restored.movements[0].amount_cents == 1001
    assert [a.amount_cents for a in restored.movements[0].allocations] == [334, 334, 333]
    assert restored.members == group.members


def test_failed_transaction_rolls_back_group_and_member_changes(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, _ = persisted_group
    initial_name = group.name
    # Act / When
    with pytest.raises(RuntimeError):
        with PostgresUnitOfWork(connection) as uow:
            group.name = "Changed"
            uow.repository.save_group(group)
            group.members[1].alias = "Renamed"
            uow.repository.save_member(group.id, group.members[1])
            raise RuntimeError("rollback")
    # Assert / Then
    with PostgresUnitOfWork(connection) as uow:
        restored, _ = uow.repository.get(creator_hash, lock=False)
    assert restored.name == initial_name
    assert restored.members[1].alias == "Bruno"


def test_two_concurrent_claims_have_exactly_one_winner(persisted_group):
    # Arrange / Given
    url, _, group, _, member_hash = persisted_group
    barrier = Barrier(2)

    def claim():
        with psycopg.Connection[dict[str, Any]].connect(
            url, autocommit=True, row_factory=dict_row
        ) as connection:
            operation = ClaimIdentityHandler(
                lambda: PostgresUnitOfWork(connection), FrozenClock(), SecureTokens()
            )
            barrier.wait(timeout=5)
            try:
                operation.handle(ClaimIdentity(Access(member_hash), group.members[1].id))
                return "claimed"
            except Conflict:
                return "conflict"

    # Act / When
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: claim(), range(2)))
    # Assert / Then
    assert sorted(outcomes) == ["claimed", "conflict"]


def test_close_removes_group_members_movements_and_allocations(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, _ = persisted_group
    data = MovementInput(
        "expense",
        1000,
        "Cena",
        date(2026, 9, 10),
        group.members[0].id,
        [m.id for m in group.members],
    )
    movement = build_movement(
        group, data, today=data.date, now=FrozenClock().now(), identifier=str(uuid4())
    )
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.save_movement(group.id, movement)
    # Act / When
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.delete_group(group.id)
    # Assert / Then
    assert (
        connection.execute("SELECT id FROM appachas.groups WHERE id=%s", (group.id,)).fetchone()
        is None
    )
    assert (
        connection.execute(
            "SELECT id FROM appachas.members WHERE group_id=%s", (group.id,)
        ).fetchone()
        is None
    )
    assert (
        connection.execute(
            "SELECT id FROM appachas.movements WHERE group_id=%s", (group.id,)
        ).fetchone()
        is None
    )
    assert (
        connection.execute(
            "SELECT member_id FROM appachas.movement_allocations WHERE group_id=%s", (group.id,)
        ).fetchone()
        is None
    )
    assert PostgresRepository(connection).get(creator_hash, lock=False) is None


def test_expiry_deletes_persisted_group_and_is_idempotent(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, _ = persisted_group
    group.start_date, group.end_date = date(2020, 1, 1), date(2020, 1, 2)
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.save_group(group)
    operation = ExpireGroupsHandler(
        lambda: PostgresUnitOfWork(connection), FrozenClock(datetime(2020, 1, 12, 12, tzinfo=UTC))
    )
    # Act / When
    removed = operation.handle()
    # Assert / Then
    assert removed >= 1
    assert PostgresRepository(connection).get(creator_hash, lock=False) is None
    assert operation.handle() == 0


def test_creator_session_is_persisted_as_hash_and_authorizes_without_link(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, _ = persisted_group
    operation = StartSessionHandler(
        lambda: PostgresUnitOfWork(connection), FrozenClock(), SecureTokens()
    )
    # Act / When
    result = operation.handle(Access(creator_hash, group_id=group.id))
    # Assert / Then
    row = connection.execute(
        "SELECT token_hash,role,revoked_at FROM appachas.sessions WHERE group_id=%s", (group.id,)
    ).fetchone()
    assert row is not None
    assert row["role"] == "creator"
    assert row["revoked_at"] is None
    assert len(row["token_hash"]) == 64
    assert result.session_token is not None
    assert row["token_hash"] != result.session_token
    actor = PostgresRepository(connection).session_actor(group.id, row["token_hash"])
    assert actor is not None and actor.is_creator


def test_release_revokes_persisted_member_session(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, member_hash = persisted_group
    claim = ClaimIdentityHandler(
        lambda: PostgresUnitOfWork(connection), FrozenClock(), SecureTokens()
    )
    claimed = claim.handle(ClaimIdentity(Access(member_hash), group.members[1].id))
    member = claimed.group.members[1]
    assert member.session_hash is not None
    operation = ReleaseMemberHandler(lambda: PostgresUnitOfWork(connection), FrozenClock())
    # Act / When
    operation.handle(Access(creator_hash), member.id, member.version)
    # Assert / Then
    row = connection.execute(
        "SELECT revoked_at FROM appachas.sessions WHERE token_hash=%s", (member.session_hash,)
    ).fetchone()
    assert row is not None and row["revoked_at"] is not None
    assert PostgresRepository(connection).session_actor(group.id, member.session_hash) is None


def test_group_deletion_cascades_all_sessions(persisted_group):
    # Arrange / Given
    _, connection, group, creator_hash, member_hash = persisted_group
    StartSessionHandler(
        lambda: PostgresUnitOfWork(connection), FrozenClock(), SecureTokens()
    ).handle(Access(creator_hash))
    ClaimIdentityHandler(
        lambda: PostgresUnitOfWork(connection), FrozenClock(), SecureTokens()
    ).handle(ClaimIdentity(Access(member_hash), group.members[1].id))
    # Act / When
    with PostgresUnitOfWork(connection) as uow:
        uow.repository.delete_group(group.id)
    # Assert / Then
    assert (
        connection.execute(
            "SELECT token_hash FROM appachas.sessions WHERE group_id=%s", (group.id,)
        ).fetchall()
        == []
    )
