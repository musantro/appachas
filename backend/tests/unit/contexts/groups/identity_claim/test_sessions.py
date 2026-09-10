from dataclasses import replace

import pytest

from appachas.contexts.groups.identity_claim.application.handler import (
    ClaimIdentity,
    ClaimIdentityHandler,
)
from appachas.contexts.groups.identity_claim.application.session import StartSessionHandler
from appachas.contexts.groups.member_management.application.handlers import ReleaseMemberHandler
from appachas.contexts.groups.settlement.application.handlers import ReadGroupHandler
from appachas.contexts.groups.shared.application.ports import Access, Session
from appachas.contexts.groups.shared.domain.errors import Forbidden
from tests.mothers import FakeTokens, FrozenClock, GroupMother, MemoryRepository


def test_creator_link_issues_independent_session_and_cookie_access_needs_no_link():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    operation = StartSessionHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    result = operation.handle(Access("creator", group_id=group.id))
    # Assert / Then
    assert result.is_creator
    assert result.session_token
    stored = next(iter(repository.sessions.values()))
    assert stored.token_hash != result.session_token
    view = ReadGroupHandler(repository.unit_of_work, FrozenClock()).handle(
        Access(group_id=group.id, session_hash=stored.token_hash)
    )
    assert view.actor.is_creator


def test_member_link_cannot_issue_session_without_claim():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    operation = StartSessionHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    with pytest.raises(Forbidden) as error:
        operation.handle(Access("member", group_id=group.id))
    # Assert / Then
    assert error.value.code == "identity_required"
    assert not repository.sessions


def test_member_link_recovers_only_existing_claim_without_returning_credential():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].session_hash = "active-session"
    repository = MemoryRepository(group)
    operation = StartSessionHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    result = operation.handle(Access("member", "active-session", group.id))
    # Assert / Then
    assert result.member_id == group.members[1].id
    assert not result.is_creator
    assert result.session_token is None


def test_releasing_identity_revokes_session_access():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].session_hash = "active-session"
    repository = MemoryRepository(group)
    operation = ReleaseMemberHandler(repository.unit_of_work, FrozenClock())
    # Act / When
    operation.handle(Access("creator"), group.members[1].id, group.members[1].version)
    # Assert / Then
    assert repository.sessions["active-session"].revoked_at is not None
    assert repository.session_actor(group.id, "active-session") is None
    with pytest.raises(Forbidden):
        ReadGroupHandler(repository.unit_of_work, FrozenClock()).handle(
            Access(group_id=group.id, session_hash="active-session")
        )


def test_switching_identity_revokes_old_session_and_issues_new_one():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].session_hash = "old-session"
    repository = MemoryRepository(group)
    operation = ClaimIdentityHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    result = operation.handle(
        ClaimIdentity(Access(group_id=group.id, session_hash="old-session"), group.members[2].id)
    )
    # Assert / Then
    assert repository.sessions["old-session"].revoked_at is not None
    assert not group.members[1].claimed
    assert result.member_id == group.members[2].id
    assert sum(s.revoked_at is None for s in repository.sessions.values()) == 1


def test_session_cannot_be_replayed_for_different_group():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    repository.save_session(
        Session("session", "another-group", group.creator_member_id, True, FrozenClock().now())
    )
    operation = ReadGroupHandler(repository.unit_of_work, FrozenClock())
    # Act / When
    with pytest.raises(Forbidden) as error:
        operation.handle(Access(group_id=group.id, session_hash="session"))
    # Assert / Then
    assert error.value.code == "identity_required"


def test_revoked_creator_session_does_not_authorize_operations():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    session = Session("session", group.id, group.creator_member_id, True, FrozenClock().now())
    repository.save_session(replace(session, revoked_at=FrozenClock().now()))
    operation = ReadGroupHandler(repository.unit_of_work, FrozenClock())
    # Act / When
    with pytest.raises(Forbidden) as error:
        operation.handle(Access(group_id=group.id, session_hash="session"))
    # Assert / Then
    assert error.value.code == "identity_required"


def test_group_reference_without_link_or_session_cannot_claim_identity():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    operation = ClaimIdentityHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    with pytest.raises(Forbidden) as error:
        operation.handle(ClaimIdentity(Access(group_id=group.id), group.members[1].id))
    # Assert / Then
    assert error.value.code == "identity_required"
    assert not repository.sessions
