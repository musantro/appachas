from collections.abc import Iterator
from functools import partial
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, Request
from psycopg import Connection
from psycopg_pool import ConnectionPool

from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Unavailable
from appachas.infrastructure.bootstrap.adapters import token_hash
from appachas.infrastructure.bootstrap.container import Container


def cookie_name(token: str) -> str:
    return "appachas_" + token_hash(token)[:16]


def bearer_token(request: Request) -> str:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or len(token) < 40 or len(token) > 256:
        raise Unavailable()
    return token


def access_context(request: Request) -> Access:
    token = bearer_token(request)
    session = request.cookies.get(cookie_name(token))
    return Access(token_hash(token), token_hash(session) if session else None)


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
