from copy import deepcopy
from datetime import UTC, date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from appachas.contexts.groups.shared.domain.models import Group, Member


class GroupMother:
    @staticmethod
    def with_members(*aliases: str, end_date: date = date(2026, 9, 15)) -> Group:
        names = aliases or ("Ana", "Bruno", "Carla")
        return Group(
            id=str(UUID(int=1)),
            name="Viaje",
            start_date=date(2026, 9, 10),
            end_date=end_date,
            timezone="Europe/Madrid",
            creator_member_id=str(UUID(int=2)),
            created_at=datetime(2026, 9, 10, 10, tzinfo=UTC),
            members=[
                Member(str(UUID(int=i + 2)), alias, i, i == 0) for i, alias in enumerate(names)
            ],
        )


class FrozenClock:
    def __init__(self, now: datetime = datetime(2026, 9, 10, 10, tzinfo=UTC)):
        self.value = now

    def now(self) -> datetime:
        return self.value

    def today(self, timezone: str) -> date:
        return self.value.astimezone(ZoneInfo(timezone)).date()


class FakeTokens:
    def __init__(self):
        self.counter = 100

    def identifier(self) -> str:
        self.counter += 1
        return str(UUID(int=self.counter))

    def generate(self) -> tuple[str, str]:
        token = self.identifier()
        return f"credential-{token}", f"hash-{token}"


class MemoryRepository:
    def __init__(self, group: Group):
        self.group: Group | None = group
        self.commits = 0
        self.rollbacks = 0

    def get(self, token_hash: str, *, lock: bool):
        if not self.group or token_hash not in ("creator", "member"):
            return None
        return self.group, token_hash == "creator"

    def create(self, group: Group, creator_hash: str, member_hash: str):
        self.group = group

    def save_group(self, group: Group):
        self.group = group

    def save_member(self, group_id: str, member: Member):
        assert self.group
        if all(m.id != member.id for m in self.group.members):
            self.group.members.append(member)

    def delete_member(self, member_id: str):
        assert self.group
        self.group.members = [m for m in self.group.members if m.id != member_id]

    def save_movement(self, group_id: str, movement):
        assert self.group
        self.group.movements = [m for m in self.group.movements if m.id != movement.id] + [movement]

    def delete_movement(self, movement_id: str):
        assert self.group
        self.group.movements = [m for m in self.group.movements if m.id != movement_id]

    def delete_group(self, group_id: str):
        self.group = None

    def expiry_candidates(self):
        return [self.group] if self.group else []

    def unit_of_work(self):
        return MemoryUnitOfWork(self)


class MemoryUnitOfWork:
    def __init__(self, repository: MemoryRepository):
        self.repository = repository

    def __enter__(self):
        self.snapshot = deepcopy(self.repository.group)
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type:
            self.repository.group = self.snapshot
            self.repository.rollbacks += 1
        else:
            self.repository.commits += 1
