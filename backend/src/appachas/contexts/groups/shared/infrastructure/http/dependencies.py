from collections.abc import Iterator
from functools import partial
from typing import Annotated
from uuid import UUID

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, Request
from psycopg import Connection
from psycopg_pool import ConnectionPool

from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Forbidden, Unavailable
from appachas.infrastructure.bootstrap.adapters import token_hash
from appachas.infrastructure.bootstrap.container import Container


def cookie_name(group_id: str) -> str:
    return "appachas_" + group_id


def migration_cookie_name(migration_id: str) -> str:
    return "appachas_migration_binding_" + migration_id


def migration_access(source: bool = False):
    def resolve(request: Request) -> Access:
        settings = request.app.state.container.settings()
        expected = settings.migration_source_origin if source else settings.migration_target_origin
        # Unlike the generic CSRF policy, migration is restricted to its exact
        # host and phase. Neither Referer nor forwarded host can widen trust.
        if (
            request.headers.get("origin") != expected
            or str(request.base_url).rstrip("/") != expected
        ):
            raise Forbidden(
                "migration_origin_forbidden", "El dominio de este traslado no está permitido."
            )
        return access_context(request)

    return resolve


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
