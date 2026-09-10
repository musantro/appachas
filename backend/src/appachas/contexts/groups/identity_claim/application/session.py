from dataclasses import dataclass

from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import Access, Session
from appachas.contexts.groups.shared.domain.models import Group


@dataclass
class StartedSession:
    group: Group
    member_id: str
    is_creator: bool
    session_token: str | None


class StartSessionHandler(Handler):
    def handle(self, access: Access) -> StartedSession:
        with self.uow_factory() as uow:
            group, actor = load_group(uow.repository, access, self.clock, lock=True)
            current = require_actor(actor)
            existing = (
                uow.repository.session_actor(group.id, access.session_hash)
                if access.session_hash and access.group_id == group.id
                else None
            )
            if existing and existing == current:
                return StartedSession(group, current.member_id, current.is_creator, None)
            # A member link can only recover the already claimed session. Only the
            # creator link grants permission to issue a session without a claim.
            require_actor(current, creator=True)
            raw, hashed = self.tokens.generate()
            uow.repository.save_session(
                Session(hashed, group.id, current.member_id, True, self.clock.now())
            )
            return StartedSession(group, current.member_id, True, raw)
