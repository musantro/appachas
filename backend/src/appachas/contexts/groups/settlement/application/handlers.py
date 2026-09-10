from dataclasses import dataclass

from appachas.contexts.groups.settlement.domain.calculation import Settlement, calculate
from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access, Actor
from appachas.contexts.groups.shared.domain.models import Group


@dataclass
class GroupView:
    group: Group
    actor: Actor
    settlement: Settlement


class ReadMetadataHandler(Handler):
    def handle(self, access: Access) -> Group:
        with self.uow_factory() as uow:
            group, _ = load_group(uow.repository, access, self.clock)
            return group


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
