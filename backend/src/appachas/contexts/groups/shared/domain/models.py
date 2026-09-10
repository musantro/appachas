from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from appachas.contexts.groups.shared.domain.errors import invalid

MovementType = Literal["expense", "refund", "contribution"]


def valid_name(value: str, field_name: str = "alias", maximum: int = 20) -> str:
    result = value.strip()
    if not result or len(result) > maximum or any(ord(c) < 32 for c in result):
        raise invalid(
            "invalid_name", f"Introduce un nombre de 1 a {maximum} caracteres.", field_name
        )
    return result


def valid_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise invalid("invalid_timezone", "La zona horaria no es válida.", "timezone") from None
    return value


def valid_dates(start: date, end: date, today: date, *, creating: bool = False) -> None:
    if start > end or (creating and (start < today or end <= today)):
        raise invalid("invalid_dates", "Revisa las fechas del grupo.", "end_date")


@dataclass
class Member:
    id: str
    alias: str
    position: int
    is_creator: bool = False
    session_hash: str | None = None
    version: int = 1
    joined_at: datetime | None = None

    @property
    def claimed(self) -> bool:
        return self.is_creator or self.session_hash is not None


@dataclass
class Allocation:
    member_id: str
    amount_cents: int


@dataclass
class Movement:
    id: str
    type: MovementType
    amount_cents: int
    concept: str
    date: date
    payer_id: str
    allocations: list[Allocation]
    created_at: datetime
    updated_at: datetime
    version: int = 1


@dataclass
class Group:
    id: str
    name: str
    start_date: date
    end_date: date
    timezone: str
    creator_member_id: str
    created_at: datetime
    members: list[Member] = field(default_factory=list)
    movements: list[Movement] = field(default_factory=list)
    last_movement_on: date | None = None
    version: int = 1

    def member(self, member_id: str) -> Member:
        for member in self.members:
            if member.id == member_id:
                return member
        raise invalid("member_not_found", "El integrante no pertenece a este grupo.", "member_id")

    def unique_alias(self, alias: str, excluding: str | None = None) -> str:
        clean = valid_name(alias)
        if any(m.id != excluding and m.alias.casefold() == clean.casefold() for m in self.members):
            raise invalid(
                "member_alias_already_used", "Ya existe un integrante con ese nombre.", "alias"
            )
        return clean

    def expires_on(self) -> date:
        activity = max(self.end_date, self.last_movement_on or self.end_date)
        return min(activity + timedelta(days=10), self.end_date + timedelta(days=30))

    def expired(self, today: date) -> bool:
        return today >= self.expires_on()

    def movement(self, movement_id: str) -> Movement:
        for movement in self.movements:
            if movement.id == movement_id:
                return movement
        raise invalid("movement_not_found", "El movimiento ya no existe.")
