from datetime import date

from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import expect_version, invalid
from appachas.contexts.groups.shared.domain.models import Group, valid_dates, valid_name


class EditGroupHandler(Handler):
    def handle(
        self, access: Access, name: str, start_date: date, end_date: date, version: int
    ) -> Group:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor, creator=True)
            expect_version(group.version, version)
            today = self.clock.today(group.timezone)
            dates_changed = (start_date, end_date) != (group.start_date, group.end_date)
            if dates_changed:
                if today >= group.end_date:
                    raise invalid(
                        "group_dates_locked", "Las fechas ya no se pueden modificar.", "end_date"
                    )
                valid_dates(start_date, end_date, today)
                if end_date <= today:
                    raise invalid(
                        "invalid_dates", "La fecha final debe ser posterior a hoy.", "end_date"
                    )
                if any(m.date > end_date for m in group.movements):
                    raise invalid(
                        "movement_outside_dates",
                        "La fecha final deja movimientos fuera del grupo.",
                        "end_date",
                    )
                # Pre-trip expenses remain valid; a start-date change must not exclude a movement
                # that previously belonged to the trip itself.
                if start_date > group.start_date and any(
                    group.start_date <= m.date < start_date for m in group.movements
                ):
                    raise invalid(
                        "movement_outside_dates",
                        "La fecha inicial deja movimientos fuera del grupo.",
                        "start_date",
                    )
            group.name = valid_name(name, "name")
            group.start_date, group.end_date = start_date, end_date
            group.version += 1
            uow.repository.save_group(group)
            return group


class CloseGroupHandler(Handler):
    def handle(self, access: Access, version: int) -> None:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor, creator=True)
            expect_version(group.version, version)
            uow.repository.delete_group(group.id)


class ExpireGroupsHandler(Handler):
    def handle(self) -> int:
        removed = 0
        with self.uow_factory() as uow:
            for group in uow.repository.expiry_candidates():
                if group.expired(self.clock.today(group.timezone)):
                    uow.repository.delete_group(group.id)
                    removed += 1
        return removed
