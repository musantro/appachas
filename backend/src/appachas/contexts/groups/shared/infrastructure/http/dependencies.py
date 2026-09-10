from collections.abc import Iterator
from functools import partial
from typing import Annotated
from uuid import UUID

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, Request
from psycopg import Connection
from psycopg_pool import ConnectionPool

from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Unavailable
from appachas.infrastructure.bootstrap.adapters import token_hash
from appachas.infrastructure.bootstrap.container import Container


def cookie_name(group_id: str) -> str:
    return "appachas_" + group_id


def bearer_token(request: Request) -> str:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or len(token) < 40 or len(token) > 256:
        raise Unavailable()
    return token


def access_context(request: Request) -> Access:
    group_id = request.headers.get("x-appachas-group")
    try:
        group_id = str(UUID(group_id)) if group_id else None
    except ValueError:
        raise Unavailable() from None
    if group_id is None:
        raise Unavailable()
    session = request.cookies.get(cookie_name(group_id))
    return Access(session_hash=token_hash(session) if session else None, group_id=group_id)


def entry_access_context(request: Request) -> Access:
    token = bearer_token(request)
    group_id = request.headers.get("x-appachas-group")
    if group_id:
        access = access_context(request)
        return Access(token_hash(token), access.session_hash, access.group_id)
    return Access(token_hash(token))


def claim_access_context(request: Request) -> Access:
    if request.headers.get("authorization"):
        return entry_access_context(request)
    return access_context(request)


@inject
def connection(
    pool: Annotated[ConnectionPool, Depends(Provide[Container.pool])],
) -> Iterator[Connection]:
    with pool.connection() as current:
        yield current


def handler(name: str):
    def resolve(request: Request, current: Annotated[Connection, Depends(connection)]):
        container = request.app.state.container
        return getattr(container, name)(uow_factory=partial(container.uow, connection=current))

    return resolve


AccessDependency = Annotated[Access, Depends(access_context)]
EntryAccessDependency = Annotated[Access, Depends(entry_access_context)]
ClaimAccessDependency = Annotated[Access, Depends(claim_access_context)]
