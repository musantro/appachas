from appachas.contexts.groups.movement_management.domain.rules import MovementInput, build_movement
from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import expect_version, invalid
from appachas.contexts.groups.shared.domain.models import Movement


class AddMovementHandler(Handler):
    def handle(self, access: Access, data: MovementInput) -> Movement:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor)
            if len(group.movements) >= 5000:
                raise invalid("movement_limit", "Se ha alcanzado el límite técnico de movimientos.")
            today = self.clock.today(group.timezone)
            movement = build_movement(
                group,
                data,
                today=today,
                now=self.clock.now(),
                identifier=self.tokens.identifier(),
            )
            uow.repository.save_movement(group.id, movement)
            group.last_movement_on = today
            group.version += 1
            uow.repository.save_group(group)
            return movement


class EditMovementHandler(Handler):
    def handle(
        self, access: Access, movement_id: str, data: MovementInput, version: int
    ) -> Movement:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor)
            previous = group.movement(movement_id)
            expect_version(previous.version, version)
            movement = build_movement(
                group,
                data,
                today=self.clock.today(group.timezone),
                now=self.clock.now(),
                identifier=previous.id,
                previous=previous,
            )
            uow.repository.save_movement(group.id, movement)
            group.version += 1
            uow.repository.save_group(group)
            return movement


class DeleteMovementHandler(Handler):
    def handle(self, access: Access, movement_id: str, version: int) -> None:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor)
            previous = group.movement(movement_id)
            expect_version(previous.version, version)
            uow.repository.delete_movement(movement_id)
            group.version += 1
            uow.repository.save_group(group)
