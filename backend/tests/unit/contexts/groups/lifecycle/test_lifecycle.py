from datetime import UTC, date, datetime, timedelta

import pytest

from appachas.contexts.groups.lifecycle.application.handlers import (
    EditGroupHandler,
    ExpireGroupsHandler,
)
from appachas.contexts.groups.movement_management.application.handlers import (
    AddMovementHandler,
    DeleteMovementHandler,
    EditMovementHandler,
)
from appachas.contexts.groups.movement_management.domain.rules import MovementInput
from appachas.contexts.groups.settlement.application.handlers import ReadGroupHandler
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import InvalidInput
from tests.mothers import FakeTokens, FrozenClock, GroupMother, MemoryRepository


@pytest.mark.parametrize(
    "days,activity,expired",
    [
        (9, None, False),
        (10, None, True),
        (15, 9, False),
        (19, 9, True),
        (29, 29, False),
        (30, 29, True),
    ],
)
def test_expiry_inactivity_and_absolute_limit(days, activity, expired):
    # Arrange / Given
    group = GroupMother.with_members()
    if activity is not None:
        group.last_movement_on = group.end_date + timedelta(days=activity)
    today = group.end_date + timedelta(days=days)
    # Act / When
    actual = group.expired(today)
    # Assert / Then
    assert actual is expired


def test_expiry_command_is_idempotent_and_removes_expired_group():
    # Arrange / Given
    repository = MemoryRepository(GroupMother.with_members())
    clock = FrozenClock(datetime(2026, 9, 25, 0, tzinfo=UTC))
    operation = ExpireGroupsHandler(repository.unit_of_work, clock)
    # Act / When
    removed = operation.handle()
    # Assert / Then
    assert removed == 1
    assert repository.group is None
    assert operation.handle() == 0


@pytest.mark.parametrize("action", ["read", "edit", "delete"])
def test_only_new_movements_renew_activity(action):
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    clock = FrozenClock(datetime(2026, 9, 20, 12, tzinfo=UTC))
    data = MovementInput(
        "expense",
        1000,
        "Hotel",
        date(2026, 9, 15),
        group.members[0].id,
        [m.id for m in group.members],
    )
    movement = AddMovementHandler(repository.unit_of_work, clock, FakeTokens()).handle(
        Access("creator"), data
    )
    clock.value = datetime(2026, 9, 21, 12, tzinfo=UTC)
    # Act / When
    if action == "read":
        ReadGroupHandler(repository.unit_of_work, clock).handle(Access("creator"))
    elif action == "edit":
        EditMovementHandler(repository.unit_of_work, clock).handle(
            Access("creator"), movement.id, data, movement.version
        )
    else:
        DeleteMovementHandler(repository.unit_of_work, clock).handle(
            Access("creator"), movement.id, movement.version
        )
    # Assert / Then
    assert repository.group is not None
    assert repository.group.last_movement_on == date(2026, 9, 20)
    assert repository.group.expires_on() == date(2026, 9, 30)


def test_final_date_cannot_change_once_reached_but_name_can():
    # Arrange / Given
    group = GroupMother.with_members()
    repository = MemoryRepository(group)
    operation = EditGroupHandler(
        repository.unit_of_work, FrozenClock(datetime(2026, 9, 15, 0, tzinfo=UTC))
    )
    # Act / When
    with pytest.raises(InvalidInput) as error:
        operation.handle(
            Access("creator"), group.name, group.start_date, date(2026, 9, 16), group.version
        )
    # Assert / Then
    assert error.value.code == "group_dates_locked"
    assert repository.rollbacks == 1
