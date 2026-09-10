from dataclasses import dataclass
from typing import Literal

from appachas.contexts.groups.settlement.domain.calculation import Settlement, calculate
from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access, Actor
from appachas.contexts.groups.shared.domain.errors import Unavailable
from appachas.contexts.groups.shared.domain.models import Group


@dataclass
class GroupView:
    group: Group
    actor: Actor
    settlement: Settlement


@dataclass
class MetadataView:
    group: Group
    access_role: Literal["creator", "member"]


class ReadMetadataHandler(Handler):
    def handle(self, access: Access) -> MetadataView:
        with self.uow_factory() as uow:
            found = uow.repository.get(access.token_hash, lock=False) if access.token_hash else None
            if found is None:
                raise Unavailable()
            group, creator_link = found
            if group.expired(self.clock.today(group.timezone)):
                raise Unavailable()
            return MetadataView(group, "creator" if creator_link else "member")


class ReadGroupHandler(Handler):
    def handle(self, access: Access) -> GroupView:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock)
            return GroupView(group, require_actor(actor), calculate(group))


class ReadSettlementHandler(Handler):
    def handle(self, access: Access) -> Settlement:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock)
            require_actor(actor)
            return calculate(group)
