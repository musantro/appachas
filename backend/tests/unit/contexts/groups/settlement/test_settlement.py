from datetime import date

import pytest

from appachas.contexts.groups.movement_management.domain.rules import MovementInput, build_movement
from appachas.contexts.groups.settlement.domain.calculation import calculate
from tests.mothers import FrozenClock, GroupMother


@pytest.mark.parametrize(
    "kind,expected", [("expense", [667, -334, -333]), ("refund", [-667, 334, 333])]
)
def test_signed_movements_balance_exactly_to_zero(kind, expected):
    # Arrange / Given
    group = GroupMother.with_members()
    data = MovementInput(
        kind, "10.01", "Cena", date(2026, 9, 10), group.members[0].id, [m.id for m in group.members]
    )
    group.movements = [
        build_movement(group, data, today=data.date, now=FrozenClock().now(), identifier="m")
    ]
    # Act / When
    result = calculate(group)
    # Assert / Then
    assert [b.amount_cents for b in result.balances] == expected
    assert sum(b.amount_cents for b in result.balances) == 0


def test_contribution_clears_only_residual_debt_and_does_not_change_total():
    # Arrange / Given
    group = GroupMother.with_members("Ana", "Bruno")
    now = FrozenClock().now()
    expense = MovementInput(
        "expense", "60", "Hotel", now.date(), group.members[0].id, [m.id for m in group.members]
    )
    contribution = MovementInput(
        "contribution", "30", "", now.date(), group.members[1].id, [group.members[0].id]
    )
    group.movements = [
        build_movement(group, data, today=now.date(), now=now, identifier=str(i))
        for i, data in enumerate([expense, contribution])
    ]
    # Act / When
    result = calculate(group)
    # Assert / Then
    assert result.total_cents == 6000
    assert result.payments == []
    assert result.text == ""


def test_settlement_ties_use_join_order_and_exact_spanish_text():
    # Arrange / Given
    group = GroupMother.with_members("Ana", "Bruno", "Carla")
    now = FrozenClock().now()
    data = MovementInput(
        "expense", "25", "Cena", now.date(), group.members[0].id, [m.id for m in group.members[1:]]
    )
    group.movements = [build_movement(group, data, today=now.date(), now=now, identifier="m")]
    # Act / When
    result = calculate(group)
    # Assert / Then
    assert result.text == "Bruno paga 12,50 € a Ana\nCarla paga 12,50 € a Ana"


def test_overpayment_is_accepted_and_reverses_residual_debt():
    # Arrange / Given
    group = GroupMother.with_members("Ana", "Bruno")
    now = FrozenClock().now()
    data = MovementInput(
        "contribution", "12.50", "", now.date(), group.members[1].id, [group.members[0].id]
    )
    group.movements = [build_movement(group, data, today=now.date(), now=now, identifier="m")]
    # Act / When
    result = calculate(group)
    # Assert / Then
    assert result.text == "Ana paga 12,50 € a Bruno"
    assert result.total_cents == 0
