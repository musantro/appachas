from appachas.contexts.groups.movement_management.domain.rules import MovementInput, build_movement
from appachas.contexts.groups.shared.infrastructure.http.models import MovementResponse
from tests.mothers import FrozenClock, GroupMother


def test_refund_http_presentation_is_signed_without_mutating_positive_domain_amounts():
    # Arrange / Given
    group = GroupMother.with_members()
    now = FrozenClock().now()
    data = MovementInput(
        "refund", 5, "Reserva", now.date(), group.members[0].id, [m.id for m in group.members]
    )
    movement = build_movement(group, data, today=now.date(), now=now, identifier="m")
    # Act / When
    response = MovementResponse.from_movement(movement)
    # Assert / Then
    assert response.amount_cents == -5
    assert [a.amount_cents for a in response.allocations] == [-2, -2, -1]
    assert movement.amount_cents == 5
    assert [a.amount_cents for a in movement.allocations] == [2, 2, 1]
