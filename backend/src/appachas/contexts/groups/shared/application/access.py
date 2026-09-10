from appachas.contexts.groups.shared.application.ports import (
    Access,
    Actor,
    Clock,
    Repository,
    Tokens,
    UnitOfWorkFactory,
)
from appachas.contexts.groups.shared.domain.errors import Forbidden, Unavailable
from appachas.contexts.groups.shared.domain.models import Group


def load_group(
    repository: Repository, access: Access, clock: Clock, *, lock: bool = False
) -> tuple[Group, Actor | None]:
    found = repository.get(access.token_hash, lock=lock)
    if found is None:
        raise Unavailable()
    group, creator_access = found
    if group.expired(clock.today(group.timezone)):
        raise Unavailable()
    if creator_access:
        return group, Actor(group.creator_member_id, True)
    member = next(
        (m for m in group.members if access.session_hash and m.session_hash == access.session_hash),
        None,
    )
    return group, Actor(member.id, False) if member else None


def require_actor(actor: Actor | None, *, creator: bool = False) -> Actor:
    if actor is None:
        raise Forbidden("identity_required", "Elige tu identidad para acceder al grupo.")
    if creator and not actor.is_creator:
        raise Forbidden("creator_required", "Esta acción solo está disponible para el creador.")
    return actor


class Handler:
    def __init__(self, uow_factory: UnitOfWorkFactory, clock: Clock, tokens: Tokens | None = None):
        self.uow_factory = uow_factory
        self.clock = clock
        self._tokens = tokens

    @property
    def tokens(self) -> Tokens:
        if self._tokens is None:
            raise RuntimeError("Token service was not configured for this handler")
        return self._tokens
