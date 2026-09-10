from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol, Self

from appachas.contexts.groups.shared.domain.models import Group, Member, Movement


@dataclass(frozen=True)
class Access:
    token_hash: str | None = None
    session_hash: str | None = None
    group_id: str | None = None


@dataclass(frozen=True)
class Actor:
    member_id: str
    is_creator: bool


@dataclass(frozen=True)
class Session:
    token_hash: str
    group_id: str
    member_id: str
    is_creator: bool
    created_at: datetime
    revoked_at: datetime | None = None


@dataclass
class SessionMigration:
    id: str
    group_id: str
    source_origin: str
    target_origin: str
    binding_hash: str
    created_at: datetime
    expires_at: datetime
    source_session_hash: str | None = None
    member_id: str | None = None
    is_creator: bool | None = None
    code_hash: str | None = None
    pending_session_hash: str | None = None
    redeemed_at: datetime | None = None
    confirmed_at: datetime | None = None


class Clock(Protocol):
    def now(self) -> datetime: ...
    def today(self, timezone: str) -> date: ...


class Tokens(Protocol):
    def generate(self) -> tuple[str, str]: ...
    def identifier(self) -> str: ...


class Repository(Protocol):
    def get(self, token_hash: str, *, lock: bool) -> tuple[Group, bool] | None: ...
    def get_by_id(self, group_id: str, *, lock: bool) -> Group | None: ...
    def session_actor(self, group_id: str, session_hash: str) -> Actor | None: ...
    def save_session(self, session: Session) -> None: ...
    def revoke_session(self, session_hash: str, revoked_at: datetime) -> None: ...
    def get_migration(self, group_id: str, migration_id: str) -> SessionMigration | None: ...
    def save_migration(self, migration: SessionMigration) -> None: ...
    def count_migrations(self, group_id: str) -> int: ...
    def purge_migrations(self, now: datetime, group_id: str | None = None) -> None: ...
    def revoke_member_sessions(self, member_id: str, revoked_at: datetime) -> None: ...
    def create(self, group: Group, creator_hash: str, member_hash: str) -> None: ...
    def save_group(self, group: Group) -> None: ...
    def save_member(self, group_id: str, member: Member) -> None: ...
    def delete_member(self, member_id: str) -> None: ...
    def save_movement(self, group_id: str, movement: Movement) -> None: ...
    def delete_movement(self, movement_id: str) -> None: ...
    def delete_group(self, group_id: str) -> None: ...
    def expiry_candidates(self) -> list[Group]: ...


class UnitOfWork(Protocol):
    @property
    def repository(self) -> Repository: ...

    def __enter__(self) -> Self: ...
    def __exit__(self, exc_type, exc_value, traceback) -> bool | None: ...


UnitOfWorkFactory = Callable[[], UnitOfWork]
