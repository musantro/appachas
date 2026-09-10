import pytest

from appachas.contexts.groups.identity_claim.application.handler import (
    ClaimIdentity,
    ClaimIdentityHandler,
)
from appachas.contexts.groups.member_management.application.handlers import (
    AddMemberHandler,
    DeleteMemberHandler,
    RenameMemberHandler,
)
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Conflict, Forbidden, InvalidInput
from tests.mothers import FakeTokens, FrozenClock, GroupMother, MemoryRepository


def test_switch_releases_old_identity_and_claims_new_in_one_transaction():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].session_hash = "old-session"
    repository = MemoryRepository(group)
    handler = ClaimIdentityHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    result = handler.handle(
        ClaimIdentity(Access("member", "old-session"), group.members[2].id, "Carla 🌊")
    )
    # Assert / Then
    assert not group.members[1].claimed
    assert group.members[2].claimed
    assert result.group.members[2].alias == "Carla 🌊"
    assert repository.commits == 1


def test_claim_occupied_identity_preserves_previous_claim():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].session_hash, group.members[2].session_hash = "mine", "theirs"
    repository = MemoryRepository(group)
    handler = ClaimIdentityHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    with pytest.raises(Conflict) as error:
        handler.handle(ClaimIdentity(Access("member", "mine"), group.members[2].id))
    # Assert / Then
    assert error.value.code == "member_already_claimed"
    assert repository.group is not None
    assert repository.group.members[1].session_hash == "mine"
    assert repository.rollbacks == 1


def test_duplicate_alias_rolls_back_claim():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    handler = ClaimIdentityHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    with pytest.raises(InvalidInput) as error:
        handler.handle(ClaimIdentity(Access("member"), group.members[1].id, " ana "))
    # Assert / Then
    assert error.value.code == "member_alias_already_used"
    assert repository.group is not None
    assert not repository.group.members[1].claimed


def test_member_cannot_rename_another_member():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].session_hash = "mine"
    repository = MemoryRepository(group)
    handler = RenameMemberHandler(repository.unit_of_work, FrozenClock())
    # Act / When
    with pytest.raises(Forbidden) as error:
        handler.handle(Access("member", "mine"), group.members[2].id, "Clara", 1)
    # Assert / Then
    assert error.value.code == "own_alias_only"


def test_new_member_keeps_join_order_after_previous_member_deleted():
    # Arrange / Given
    group = GroupMother.with_members("Ana", "Bruno", "Carla", "Dani")
    repository = MemoryRepository(group)
    DeleteMemberHandler(repository.unit_of_work, FrozenClock()).handle(
        Access("creator"), group.members[2].id, 1
    )
    # Act / When
    member = AddMemberHandler(repository.unit_of_work, FrozenClock(), FakeTokens()).handle(
        Access("creator"), "Elena"
    )
    # Assert / Then
    assert member.position == 4


def test_stale_member_edit_does_not_overwrite():
    # Arrange / Given
    group = GroupMother.with_members()
    group.members[1].version = 2
    repository = MemoryRepository(group)
    handler = RenameMemberHandler(repository.unit_of_work, FrozenClock())
    # Act / When
    with pytest.raises(Conflict) as error:
        handler.handle(Access("creator"), group.members[1].id, "New alias", 1)
    # Assert / Then
    assert error.value.code == "stale_version"
    assert repository.group is not None
    assert repository.group.members[1].alias == "Bruno"
