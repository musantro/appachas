from dataclasses import dataclass
from datetime import date

from appachas.contexts.groups.shared.application.access import Handler
from appachas.contexts.groups.shared.application.ports import Session
from appachas.contexts.groups.shared.domain.errors import invalid
from appachas.contexts.groups.shared.domain.models import (
    Group,
    Member,
    valid_dates,
    valid_name,
    valid_timezone,
)


@dataclass
class CreateGroup:
    name: str
    start_date: date
    end_date: date
    timezone: str
    members: list[str]
    creator_index: int


@dataclass
class CreatedGroup:
    group: Group
    creator_token: str
    member_token: str
    session_token: str


class CreateGroupHandler(Handler):
    def handle(self, command: CreateGroup) -> CreatedGroup:
        timezone = valid_timezone(command.timezone)
        valid_dates(command.start_date, command.end_date, self.clock.today(timezone), creating=True)
        if not 2 <= len(command.members) <= 50 or not 0 <= command.creator_index < len(
            command.members
        ):
            raise invalid(
                "invalid_members", "Elige entre 2 y 50 integrantes y quién eres.", "members"
            )
        group = Group(
            id=self.tokens.identifier(),
            name=valid_name(command.name, "name"),
            start_date=command.start_date,
            end_date=command.end_date,
            timezone=timezone,
            creator_member_id="",
            created_at=self.clock.now(),
        )
        for position, alias in enumerate(command.members):
            member = Member(
                self.tokens.identifier(),
                group.unique_alias(alias),
                position,
                position == command.creator_index,
                joined_at=group.created_at,
            )
            group.members.append(member)
            if member.is_creator:
                group.creator_member_id = member.id
        creator_token, creator_hash = self.tokens.generate()
        member_token, member_hash = self.tokens.generate()
        session_token, session_hash = self.tokens.generate()
        with self.uow_factory() as uow:
            uow.repository.create(group, creator_hash, member_hash)
            uow.repository.save_session(
                Session(session_hash, group.id, group.creator_member_id, True, self.clock.now())
            )
        return CreatedGroup(group, creator_token, member_token, session_token)
