from copy import deepcopy
from datetime import timedelta

import pytest

from appachas.contexts.groups.session_migration.application.handlers import (
    AuthorizeMigrationHandler,
    ConfirmMigrationHandler,
    RedeemMigrationHandler,
    StartMigrationHandler,
)
from appachas.contexts.groups.shared.application.ports import Access, Session
from appachas.contexts.groups.shared.domain.errors import (
    Conflict,
    Forbidden,
    InvalidInput,
    Unavailable,
)
from tests.mothers import FakeTokens, FrozenClock, GroupMother, MemoryRepository

SOURCE = "https://appachas.vercel.app"
TARGET = "https://appachas.es"


def fake_hash(raw):
    return raw.replace("credential-", "hash-", 1)


@pytest.fixture(params=[False, True], ids=["member", "creator"])
def migration(request):
    group = GroupMother.with_members()
    clock = FrozenClock()
    creator = request.param
    member = group.members[0 if creator else 1]
    if not creator:
        member.session_hash = "source-session"
    repository = MemoryRepository(group)
    repository.save_session(Session("source-session", group.id, member.id, creator, clock.now()))
    tokens = FakeTokens()

    def operation(cls):
        return cls(repository.unit_of_work, clock, tokens, SOURCE, TARGET)

    target = Access(group_id=group.id)
    source = Access(session_hash="source-session", group_id=group.id)
    start = operation(StartMigrationHandler).handle(target)
    return group, repository, clock, source, target, start, operation


def authorize_and_redeem(migration):
    _, _, _, source, target, start, operation = migration
    code = operation(AuthorizeMigrationHandler).handle(source, start.id)
    pending = operation(RedeemMigrationHandler).handle(
        target, start.id, fake_hash(start.binding_token), fake_hash(code)
    )
    return Access(session_hash=fake_hash(pending), group_id=target.group_id)


def test_migration_activates_only_after_cookie_confirmation_and_preserves_identity(migration):
    # Arrange / Given
    group, repository, _, source, _, start, operation = migration
    original_actor = repository.session_actor(group.id, source.session_hash)
    before_members = [(m.id, m.alias, m.claimed) for m in group.members]
    before_version = group.version
    pending = authorize_and_redeem(migration)
    assert repository.session_actor(group.id, pending.session_hash) is None
    assert repository.session_actor(group.id, source.session_hash) == original_actor
    assert len(repository.sessions) == 1
    assert "credential-" not in repr(repository.migrations)

    # Act / When
    result = operation(ConfirmMigrationHandler).handle(
        pending, start.id, fake_hash(start.binding_token)
    )

    # Assert / Then
    assert result.actor == original_actor
    assert repository.session_actor(group.id, source.session_hash) is None
    assert repository.session_actor(group.id, pending.session_hash) == original_actor
    assert [(m.id, m.alias, m.claimed) for m in group.members] == before_members
    assert group.version == before_version + (not original_actor.is_creator)
    assert len([s for s in repository.sessions.values() if s.revoked_at is None]) == 1
    assert repository.migrations[start.id].confirmed_at is not None


def test_confirmation_is_idempotent_when_its_response_was_lost(migration):
    # Arrange / Given
    group, repository, _, _, _, start, operation = migration
    pending = authorize_and_redeem(migration)
    handler = operation(ConfirmMigrationHandler)
    first = handler.handle(pending, start.id, fake_hash(start.binding_token))
    version = group.version
    sessions = deepcopy(repository.sessions)

    # Act / When
    repeated = handler.handle(pending, start.id, fake_hash(start.binding_token))

    # Assert / Then
    assert repeated == first
    assert group.version == version
    assert repository.sessions == sessions


@pytest.mark.parametrize("phase", ["authorize", "redeem", "confirm"])
def test_expired_migration_never_revokes_the_source_session(migration, phase):
    # Arrange / Given
    group, repository, clock, source, target, start, operation = migration
    code = None
    pending = None
    if phase == "redeem":
        code = operation(AuthorizeMigrationHandler).handle(source, start.id)
    elif phase == "confirm":
        pending = authorize_and_redeem(migration)
    clock.value += timedelta(seconds=120)

    # Act / When
    with pytest.raises(Forbidden) as error:
        if phase == "authorize":
            operation(AuthorizeMigrationHandler).handle(source, start.id)
        elif phase == "redeem":
            operation(RedeemMigrationHandler).handle(
                target, start.id, fake_hash(start.binding_token), fake_hash(code)
            )
        else:
            operation(ConfirmMigrationHandler).handle(
                pending, start.id, fake_hash(start.binding_token)
            )

    # Assert / Then
    assert error.value.code == "migration_invalid"
    assert repository.session_actor(group.id, source.session_hash) is not None


@pytest.mark.parametrize("problem", ["binding", "code"])
def test_failed_redemption_does_not_consume_the_code_or_change_the_source(migration, problem):
    # Arrange / Given
    group, repository, _, source, target, start, operation = migration
    code = operation(AuthorizeMigrationHandler).handle(source, start.id)
    binding_hash = fake_hash(start.binding_token) if problem != "binding" else "wrong-browser"
    code_hash = fake_hash(code) if problem != "code" else "wrong-code"

    # Act / When
    with pytest.raises(Forbidden) as error:
        operation(RedeemMigrationHandler).handle(target, start.id, binding_hash, code_hash)

    # Assert / Then
    assert error.value.code == "migration_invalid"
    assert repository.migrations[start.id].redeemed_at is None
    assert repository.session_actor(group.id, source.session_hash) is not None
    assert operation(RedeemMigrationHandler).handle(
        target, start.id, fake_hash(start.binding_token), fake_hash(code)
    )


@pytest.mark.parametrize("phase", ["authorize", "redeem"])
def test_authorization_and_redemption_are_single_use(migration, phase):
    # Arrange / Given
    group, repository, _, source, target, start, operation = migration
    code = operation(AuthorizeMigrationHandler).handle(source, start.id)
    if phase == "redeem":
        operation(RedeemMigrationHandler).handle(
            target, start.id, fake_hash(start.binding_token), fake_hash(code)
        )

    # Act / When
    with pytest.raises(Conflict) as error:
        if phase == "authorize":
            operation(AuthorizeMigrationHandler).handle(source, start.id)
        else:
            operation(RedeemMigrationHandler).handle(
                target, start.id, fake_hash(start.binding_token), fake_hash(code)
            )

    # Assert / Then
    assert error.value.code == "migration_used"
    assert repository.session_actor(group.id, source.session_hash) is not None


@pytest.mark.parametrize("phase", ["redeem", "confirm"])
def test_revoked_source_cannot_be_restored_by_a_pending_migration(migration, phase):
    # Arrange / Given
    group, repository, clock, source, target, start, operation = migration
    code = operation(AuthorizeMigrationHandler).handle(source, start.id)
    pending = None
    if phase == "confirm":
        raw = operation(RedeemMigrationHandler).handle(
            target, start.id, fake_hash(start.binding_token), fake_hash(code)
        )
        pending = Access(session_hash=fake_hash(raw), group_id=group.id)
    repository.revoke_session(source.session_hash, clock.now())

    # Act / When
    with pytest.raises(Forbidden) as error:
        if phase == "redeem":
            operation(RedeemMigrationHandler).handle(
                target, start.id, fake_hash(start.binding_token), fake_hash(code)
            )
        else:
            operation(ConfirmMigrationHandler).handle(
                pending, start.id, fake_hash(start.binding_token)
            )

    # Assert / Then
    assert error.value.code == "migration_invalid"
    assert all(s.revoked_at is not None for s in repository.sessions.values())


def test_confirmation_requires_both_browser_binding_and_installed_session_cookie(migration):
    # Arrange / Given
    group, repository, _, source, target, start, operation = migration
    pending = authorize_and_redeem(migration)

    # Act / When
    with pytest.raises(Forbidden):
        operation(ConfirmMigrationHandler).handle(target, start.id, fake_hash(start.binding_token))
    with pytest.raises(Forbidden):
        operation(ConfirmMigrationHandler).handle(pending, start.id, "another-browser")

    # Assert / Then
    assert repository.session_actor(group.id, source.session_hash) is not None
    assert repository.migrations[start.id].confirmed_at is None


def test_redemption_never_overwrites_any_existing_active_target_session(migration):
    # Arrange / Given
    group, repository, clock, source, _, start, operation = migration
    other = group.members[2]
    other.session_hash = "target-existing"
    repository.save_session(Session(other.session_hash, group.id, other.id, False, clock.now()))
    target = Access(session_hash=other.session_hash, group_id=group.id)
    code = operation(AuthorizeMigrationHandler).handle(source, start.id)

    # Act / When
    with pytest.raises(Conflict) as error:
        operation(RedeemMigrationHandler).handle(
            target, start.id, fake_hash(start.binding_token), fake_hash(code)
        )

    # Assert / Then
    assert error.value.code == "migration_target_occupied"
    assert repository.session_actor(group.id, other.session_hash).member_id == other.id
    assert repository.session_actor(group.id, source.session_hash) is not None
    assert repository.migrations[start.id].redeemed_at is None


def test_a_secret_creator_link_does_not_authorize_a_migration(migration):
    # Arrange / Given
    group, repository, _, _, _, start, operation = migration

    # Act / When
    with pytest.raises(Forbidden) as error:
        operation(AuthorizeMigrationHandler).handle(
            Access(token_hash="creator", group_id=group.id), start.id
        )

    # Assert / Then
    assert error.value.code == "identity_required"
    assert repository.migrations[start.id].code_hash is None


def test_confirmation_does_not_revive_a_later_revoked_destination_session(migration):
    # Arrange / Given
    _, repository, clock, _, _, start, operation = migration
    pending = authorize_and_redeem(migration)
    operation(ConfirmMigrationHandler).handle(pending, start.id, fake_hash(start.binding_token))
    repository.revoke_session(pending.session_hash, clock.now())

    # Act / When
    with pytest.raises(Forbidden) as error:
        operation(ConfirmMigrationHandler).handle(pending, start.id, fake_hash(start.binding_token))

    # Assert / Then
    assert error.value.code == "migration_invalid"
    assert all(s.revoked_at is not None for s in repository.sessions.values())


def test_failed_confirmation_rolls_back_source_revocation_and_member_update(migration, monkeypatch):
    # Arrange / Given
    group, repository, _, source, _, start, operation = migration
    pending = authorize_and_redeem(migration)
    snapshot = deepcopy(repository.group)

    def fail(_session):
        raise RuntimeError("simulated transaction failure")

    monkeypatch.setattr(repository, "save_session", fail)

    # Act / When
    with pytest.raises(RuntimeError):
        operation(ConfirmMigrationHandler).handle(pending, start.id, fake_hash(start.binding_token))

    # Assert / Then
    assert repository.group == snapshot
    assert repository.session_actor(group.id, source.session_hash) is not None
    assert repository.session_actor(group.id, pending.session_hash) is None
    assert repository.migrations[start.id].confirmed_at is None


def test_new_migration_purges_expired_requests_without_revoking_sessions(migration):
    # Arrange / Given
    group, repository, clock, source, target, start, operation = migration
    clock.value += timedelta(seconds=120)

    # Act / When
    fresh = operation(StartMigrationHandler).handle(target)

    # Assert / Then
    assert set(repository.migrations) == {fresh.id}
    assert fresh.id != start.id
    assert repository.session_actor(group.id, source.session_hash) is not None


def test_pending_migration_limit_is_bounded_and_expires(migration):
    # Arrange / Given
    group, repository, clock, source, target, _, operation = migration
    for _ in range(63):
        operation(StartMigrationHandler).handle(target)

    # Act / When
    with pytest.raises(InvalidInput) as error:
        operation(StartMigrationHandler).handle(target)

    # Assert / Then
    assert error.value.code == "migration_limit"
    assert repository.count_migrations(group.id) == 64
    assert repository.session_actor(group.id, source.session_hash) is not None
    clock.value += timedelta(seconds=120)
    assert operation(StartMigrationHandler).handle(target)
    assert repository.count_migrations(group.id) == 1


def test_group_deletion_cancels_pending_handoffs(migration):
    # Arrange / Given
    group, repository, _, _, _, start, operation = migration
    pending = authorize_and_redeem(migration)
    repository.delete_group(group.id)

    # Act / When
    with pytest.raises(Unavailable):
        operation(ConfirmMigrationHandler).handle(pending, start.id, fake_hash(start.binding_token))

    # Assert / Then
    assert repository.migrations == {}
    assert repository.sessions == {}


def test_creator_migration_does_not_revoke_other_creator_browsers(migration):
    # Arrange / Given
    group, repository, clock, _, _, start, operation = migration
    other_session = Session("other-creator", group.id, group.creator_member_id, True, clock.now())
    repository.save_session(other_session)
    pending = authorize_and_redeem(migration)

    # Act / When
    operation(ConfirmMigrationHandler).handle(pending, start.id, fake_hash(start.binding_token))

    # Assert / Then
    assert repository.sessions[other_session.token_hash] == other_session
    assert repository.session_actor(group.id, other_session.token_hash).is_creator
