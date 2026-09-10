from dataclasses import replace
from datetime import date, timedelta

import pytest

from appachas.contexts.groups.movement_management.domain.rules import (
    MovementInput,
    build_movement,
)
from appachas.contexts.groups.shared.domain.errors import InvalidInput
from tests.mothers import FrozenClock, GroupMother


def movement_input(group, **changes):
    return replace(
        MovementInput(
            "expense",
            1000,
            "Cena",
            date(2026, 9, 10),
            group.members[0].id,
            [m.id for m in group.members],
        ),
        **changes,
    )


@pytest.mark.parametrize("kind", ["expense", "refund"])
@pytest.mark.parametrize("amount", [1, 2, 1000, 10001])
def test_positive_split_preserves_total_and_join_order(kind, amount):
    # Arrange / Given
    group = GroupMother.with_members()
    data = movement_input(
        group,
        type=kind,
        amount_cents=amount,
        participant_ids=[m.id for m in reversed(group.members)],
    )
    # Act / When
    movement = build_movement(
        group, data, today=date(2026, 9, 10), now=FrozenClock().now(), identifier="movement"
    )
    # Assert / Then
    assert sum(a.amount_cents for a in movement.allocations) == movement.amount_cents
    assert [a.member_id for a in movement.allocations] == [m.id for m in group.members]
    assert abs(movement.allocations[0].amount_cents) >= abs(movement.allocations[-1].amount_cents)
    assert movement.amount_cents > 0
    assert all(a.amount_cents >= 0 for a in movement.allocations)


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"concept": " "}, "invalid_concept"),
        ({"concept": "a" * 51}, "invalid_concept"),
        ({"participant_ids": []}, "invalid_participants"),
        ({"date": date(2026, 9, 11)}, "invalid_movement_date"),
        ({"payer_id": "not-in-group"}, "member_not_found"),
    ],
)
def test_invalid_movement_is_rejected(changes, code):
    # Arrange / Given
    group = GroupMother.with_members()
    data = movement_input(group, **changes)
    # Act / When
    with pytest.raises(InvalidInput) as error:
        build_movement(
            group, data, today=date(2026, 9, 10), now=FrozenClock().now(), identifier="movement"
        )
    # Assert / Then
    assert error.value.code == code


def test_payer_can_be_outside_selected_participants_and_date_before_creation():
    # Arrange / Given
    group = GroupMother.with_members()
    data = movement_input(group, date=date(2025, 1, 1), participant_ids=[group.members[1].id])
    # Act / When
    movement = build_movement(
        group, data, today=date(2026, 9, 10), now=FrozenClock().now(), identifier="movement"
    )
    # Assert / Then
    assert movement.allocations[0].member_id != movement.payer_id
    assert movement.date < group.created_at.date()


def test_edit_preserves_created_at_and_inverts_refund():
    # Arrange / Given
    group = GroupMother.with_members()
    now = FrozenClock().now()
    previous = build_movement(
        group, movement_input(group), today=now.date(), now=now, identifier="movement"
    )
    # Act / When
    result = build_movement(
        group,
        movement_input(group, type="refund"),
        today=now.date(),
        now=now + timedelta(hours=1),
        identifier=previous.id,
        previous=previous,
    )
    # Assert / Then
    assert result.created_at == previous.created_at
    assert result.updated_at > previous.updated_at
    assert result.amount_cents == previous.amount_cents
    assert result.type == "refund"
    assert result.version == 2


def test_contribution_allows_custom_allocation_without_concept():
    # Arrange / Given
    group = GroupMother.with_members()
    data = movement_input(
        group,
        type="contribution",
        concept="",
        allocations=[(group.members[1].id, 399), (group.members[2].id, 601)],
    )
    # Act / When
    result = build_movement(
        group, data, today=date(2026, 9, 10), now=FrozenClock().now(), identifier="movement"
    )
    # Assert / Then
    assert [a.amount_cents for a in result.allocations] == [399, 601]


@pytest.mark.parametrize("problem", ["source", "sum", "duplicate", "conversion"])
def test_invalid_contribution_is_rejected(problem):
    # Arrange / Given
    group = GroupMother.with_members()
    recipients = [group.members[1].id]
    allocations = None
    previous = None
    if problem == "source":
        recipients = [group.members[0].id]
    elif problem == "sum":
        allocations = [(group.members[1].id, 100)]
    elif problem == "duplicate":
        recipients *= 2
    else:
        previous = build_movement(
            group,
            movement_input(group),
            today=date(2026, 9, 10),
            now=FrozenClock().now(),
            identifier="movement",
        )
    data = movement_input(
        group, type="contribution", participant_ids=recipients, allocations=allocations
    )
    # Act / When
    with pytest.raises(InvalidInput) as error:
        build_movement(
            group,
            data,
            today=date(2026, 9, 10),
            now=FrozenClock().now(),
            identifier="movement",
            previous=previous,
        )
    # Assert / Then
    assert error.value.code in (
        "source_is_recipient",
        "allocation_total_mismatch",
        "invalid_participants",
        "invalid_type_conversion",
    )


def test_late_joined_member_cannot_be_added_to_historical_movement():
    # Arrange / Given
    group = GroupMother.with_members()
    now = FrozenClock().now()
    previous = build_movement(
        group,
        movement_input(group, participant_ids=[group.members[0].id]),
        today=now.date(),
        now=now,
        identifier="historical",
    )
    group.members[2].joined_at = now + timedelta(hours=1)
    # Act / When
    with pytest.raises(InvalidInput) as error:
        build_movement(
            group,
            movement_input(group),
            today=now.date(),
            now=now + timedelta(hours=2),
            identifier=previous.id,
            previous=previous,
        )
    # Assert / Then
    assert error.value.code == "member_joined_after_movement"


@pytest.mark.parametrize("amount", [0, -1, 0.5, True, "100", 1000000000000])
def test_domain_accepts_only_positive_integer_cents_within_technical_limit(amount):
    # Arrange / Given
    group = GroupMother.with_members()
    data = movement_input(group, amount_cents=amount)
    # Act / When
    with pytest.raises(InvalidInput) as error:
        build_movement(
            group, data, today=date(2026, 9, 10), now=FrozenClock().now(), identifier="m"
        )
    # Assert / Then
    assert error.value.code == "invalid_amount"
