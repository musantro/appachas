from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Forbidden, expect_version, invalid
from appachas.contexts.groups.shared.domain.models import Member


class AddMemberHandler(Handler):
    def handle(self, access: Access, alias: str) -> Member:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor, creator=True)
            if len(group.members) >= 50:
                raise invalid("member_limit", "El grupo admite un máximo de 50 integrantes.")
            member = Member(
                self.tokens.identifier(),
                group.unique_alias(alias),
                max(m.position for m in group.members) + 1,
                joined_at=self.clock.now(),
            )
            uow.repository.save_member(group.id, member)
            group.version += 1
            uow.repository.save_group(group)
            return member


class RenameMemberHandler(Handler):
    def handle(self, access: Access, member_id: str, alias: str, version: int) -> Member:
        with self.uow_factory() as uow:
            group, found_actor = load_group(uow.repository, access, self.clock, lock=True)
            actor = require_actor(found_actor)
            if not actor.is_creator and actor.member_id != member_id:
                raise Forbidden("own_alias_only", "Solo puedes cambiar tu propio alias.")
            member = group.member(member_id)
            expect_version(member.version, version)
            member.alias = group.unique_alias(alias, member.id)
            member.version += 1
            uow.repository.save_member(group.id, member)
            group.version += 1
            uow.repository.save_group(group)
            return member


class ReleaseMemberHandler(Handler):
    def handle(self, access: Access, member_id: str, version: int) -> Member:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor, creator=True)
            member = group.member(member_id)
            expect_version(member.version, version)
            if member.is_creator:
                raise Forbidden("creator_identity_fixed", "La identidad del creador es permanente.")
            member.session_hash = None
            member.version += 1
            uow.repository.save_member(group.id, member)
            group.version += 1
            uow.repository.save_group(group)
            return member


class DeleteMemberHandler(Handler):
    def handle(self, access: Access, member_id: str, version: int) -> None:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            require_actor(actor, creator=True)
            member = group.member(member_id)
            expect_version(member.version, version)
            if member.is_creator:
                raise Forbidden("creator_identity_fixed", "El creador no se puede eliminar.")
            if len(group.members) <= 2:
                raise invalid(
                    "minimum_members", "El grupo debe conservar al menos dos integrantes."
                )
            if any(
                m.payer_id == member_id or any(a.member_id == member_id for a in m.allocations)
                for m in group.movements
            ):
                raise invalid("member_has_movements", "Este integrante aparece en movimientos.")
            uow.repository.delete_member(member_id)
            group.version += 1
            uow.repository.save_group(group)
