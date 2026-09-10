from dataclasses import dataclass

from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access, Session
from appachas.contexts.groups.shared.domain.errors import Conflict, Forbidden
from appachas.contexts.groups.shared.domain.models import Group


@dataclass
class ClaimIdentity:
    access: Access
    member_id: str
    alias: str | None = None


@dataclass
class ClaimedIdentity:
    group: Group
    member_id: str
    session_token: str


class ClaimIdentityHandler(Handler):
    def handle(self, command: ClaimIdentity) -> ClaimedIdentity:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, command.access, self.clock, lock=True)
            if command.access.token_hash is None:
                require_actor(actor)
            if actor and actor.is_creator:
                raise Forbidden("creator_identity_fixed", "La identidad del creador es permanente.")
            member = group.member(command.member_id)
            if member.claimed and (actor is None or actor.member_id != member.id):
                raise Conflict("member_already_claimed", "Este integrante ya está ocupado")
            if command.alias is not None:
                member.alias = group.unique_alias(command.alias, member.id)
            if actor and actor.member_id != member.id:
                previous = group.member(actor.member_id)
                previous.session_hash = None
                previous.version += 1
                uow.repository.revoke_member_sessions(previous.id, self.clock.now())
                uow.repository.save_member(group.id, previous)
            uow.repository.revoke_member_sessions(member.id, self.clock.now())
            raw, hashed = self.tokens.generate()
            member.session_hash = hashed
            member.version += 1
            uow.repository.save_member(group.id, member)
            uow.repository.save_session(
                Session(hashed, group.id, member.id, False, self.clock.now())
            )
            group.version += 1
            uow.repository.save_group(group)
            return ClaimedIdentity(group, member.id, raw)
