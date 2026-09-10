from dataclasses import dataclass
from datetime import date, datetime

from appachas.contexts.groups.shared.domain.errors import invalid
from appachas.contexts.groups.shared.domain.models import Allocation, Group, Movement, MovementType

MAX_CENTS = 999_999_999_999


def valid_cents(value: int, *, allow_zero: bool = False) -> int:
    if type(value) is not int or value < (0 if allow_zero else 1) or value > MAX_CENTS:
        raise invalid(
            "invalid_amount",
            "El importe debe ser al menos 0,01 € y estar dentro del límite técnico.",
            "amount",
        )
    return value


def equal_allocations(cents: int, members: list[str]) -> list[Allocation]:
    quotient, remainder = divmod(cents, len(members))
    return [
        Allocation(member, quotient + (index < remainder)) for index, member in enumerate(members)
    ]


@dataclass
class MovementInput:
    type: MovementType
    amount_cents: int
    concept: str
    date: date
    payer_id: str
    participant_ids: list[str]
    allocations: list[tuple[str, int]] | None = None


def build_movement(
    group: Group,
    data: MovementInput,
    *,
    today: date,
    now: datetime,
    identifier: str,
    previous: Movement | None = None,
) -> Movement:
    amount = valid_cents(data.amount_cents)
    if data.type not in ("expense", "refund", "contribution"):
        raise invalid("invalid_movement_type", "El tipo de movimiento no es válido.")
    if previous and ((previous.type == "contribution") != (data.type == "contribution")):
        raise invalid(
            "invalid_type_conversion", "Una aportación no se puede convertir en gasto o reembolso."
        )
    if data.date > today or data.date > group.end_date:
        raise invalid(
            "invalid_movement_date",
            "La fecha no puede ser futura ni posterior al final del grupo.",
            "date",
        )
    group.member(data.payer_id)
    concept = data.concept.strip()
    if len(concept) > 50 or (not concept and data.type != "contribution"):
        raise invalid("invalid_concept", "Introduce un concepto de hasta 50 caracteres.", "concept")
    if data.type != "contribution" and data.allocations is not None:
        raise invalid(
            "equal_split_required", "Los gastos y reembolsos se reparten a partes iguales."
        )
    selected = (
        [member_id for member_id, _ in data.allocations]
        if data.allocations is not None
        else data.participant_ids
    )
    if not selected or len(selected) != len(set(selected)):
        raise invalid(
            "invalid_participants",
            "Selecciona al menos un integrante sin duplicados.",
            "participant_ids",
        )
    for member_id in selected:
        group.member(member_id)
    if previous and any(
        member.joined_at is not None and member.joined_at > previous.created_at
        for member in (group.member(member_id) for member_id in [data.payer_id, *selected])
    ):
        raise invalid(
            "member_joined_after_movement",
            "Los integrantes añadidos después solo pueden participar en movimientos nuevos.",
            "participant_ids",
        )
    ordered = [m.id for m in sorted(group.members, key=lambda m: m.position) if m.id in selected]
    if data.type == "contribution" and data.payer_id in selected:
        raise invalid("source_is_recipient", "El origen no puede ser receptor.", "participant_ids")
    if data.allocations is not None:
        values = {
            member_id: valid_cents(value, allow_zero=True) for member_id, value in data.allocations
        }
        allocations = [Allocation(member_id, values[member_id]) for member_id in ordered]
        if sum(a.amount_cents for a in allocations) != amount:
            raise invalid(
                "allocation_total_mismatch",
                "La suma del reparto debe coincidir con el total.",
                "allocations",
            )
    else:
        allocations = equal_allocations(amount, ordered)
    return Movement(
        identifier,
        data.type,
        amount,
        concept,
        data.date,
        data.payer_id,
        allocations,
        previous.created_at if previous else now,
        now,
        previous.version + 1 if previous else 1,
    )
