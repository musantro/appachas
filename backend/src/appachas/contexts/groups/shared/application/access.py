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
    creator_access = False
    if access.token_hash:
        found = repository.get(access.token_hash, lock=lock)
        if found is None:
            raise Unavailable()
        group, creator_access = found
    elif access.group_id:
        group = repository.get_by_id(access.group_id, lock=lock)
        if group is None:
            raise Unavailable()
    else:
        raise Unavailable()
    if group.expired(clock.today(group.timezone)):
        raise Unavailable()
    if creator_access:
        return group, Actor(group.creator_member_id, True)
    actor = (
        repository.session_actor(group.id, access.session_hash)
        if access.session_hash and access.group_id in (None, group.id)
        else None
    )
    return group, actor


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
