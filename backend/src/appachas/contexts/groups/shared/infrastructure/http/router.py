import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from psycopg import Connection

from appachas.contexts.groups.group_creation.public import CreateGroup
from appachas.contexts.groups.identity_claim.public import ClaimIdentity
from appachas.contexts.groups.movement_management.public import MovementInput
from appachas.contexts.groups.settlement.public import calculate
from appachas.contexts.groups.shared.application.ports import Access
from appachas.contexts.groups.shared.domain.errors import Forbidden
from appachas.contexts.groups.shared.infrastructure.http.amounts import parse_amount
from appachas.contexts.groups.shared.infrastructure.http.dependencies import (
    AccessDependency,
    ClaimAccessDependency,
    EntryAccessDependency,
    connection,
    cookie_name,
    handler,
    migration_access,
    migration_cookie_name,
)
from appachas.contexts.groups.shared.infrastructure.http.models import (
    AddMemberRequest,
    ClaimRequest,
    ClaimResponse,
    CreateGroupRequest,
    CreateGroupResponse,
    EditGroupRequest,
    EditMovementRequest,
    ExpiryResponse,
    GroupResponse,
    HealthResponse,
    MemberResponse,
    MetadataResponse,
    MigrationAuthorizeResponse,
    MigrationIdRequest,
    MigrationRedeemRequest,
    MigrationStartRequest,
    MigrationStartResponse,
    MovementRequest,
    MovementResponse,
    Problem,
    RenameMemberRequest,
    SettlementResponse,
    VersionRequest,
)
from appachas.infrastructure.bootstrap.adapters import token_hash

MigrationSourceAccess = Annotated[Access, Depends(migration_access(source=True))]
MigrationTargetAccess = Annotated[Access, Depends(migration_access())]
MIGRATION_COOKIE_PATH = "/api/group/migration"

router = APIRouter(responses={code: {"model": Problem} for code in (403, 404, 409, 422, 429, 500)})


def group_response(group, member_id: str, creator: bool, clock) -> GroupResponse:
    metadata = MetadataResponse.from_group(group, clock.today(group.timezone))
    settlement = SettlementResponse.model_validate(calculate(group))
    return GroupResponse(
        **metadata.model_dump(),
        role="creator" if creator else "member",
        my_member_id=member_id,
        movements=[MovementResponse.from_movement(m) for m in group.movements],
        balances=settlement.balances,
        payments=settlement.payments,
        settlement_text=settlement.text,
        total_cents=settlement.total_cents,
    )


def movement_input(body: MovementRequest) -> MovementInput:
    return MovementInput(
        body.type,
        parse_amount(body.amount),
        body.concept,
        body.date,
        body.payer_id,
        body.participant_ids,
        [(a.member_id, parse_amount(a.amount, allow_zero=True)) for a in body.allocations]
        if body.allocations is not None
        else None,
    )


@router.get("/api/health", response_model=HealthResponse)
def health(current: Annotated[Connection, Depends(connection)]):
    current.execute("SELECT 1")
    return HealthResponse(status="ok")


@router.post("/api/groups", response_model=CreateGroupResponse, status_code=201)
def create_group(
    body: CreateGroupRequest,
    request: Request,
    response: Response,
    operation=Depends(handler("create_group")),
):
    result = operation.handle(CreateGroup(**body.model_dump()))
    set_session_cookie(response, request, result.group.id, result.session_token)
    origin = str(request.base_url).rstrip("/")
    return CreateGroupResponse(
        creator_token=result.creator_token,
        member_token=result.member_token,
        creator_url=f"{origin}/g#{result.creator_token}",
        member_url=f"{origin}/g#{result.member_token}",
        group=group_response(result.group, result.group.creator_member_id, True, operation.clock),
    )


@router.get("/api/group/metadata", response_model=MetadataResponse)
def metadata(access: EntryAccessDependency, operation=Depends(handler("read_metadata"))):
    view = operation.handle(access)
    result = MetadataResponse.from_group(view.group, operation.clock.today(view.group.timezone))
    result.access_role = view.access_role
    return result


@router.get("/api/group", response_model=GroupResponse)
def read_group(access: AccessDependency, operation=Depends(handler("read_group"))):
    view = operation.handle(access)
    return group_response(view.group, view.actor.member_id, view.actor.is_creator, operation.clock)


@router.post("/api/group/claims", response_model=ClaimResponse)
def claim_identity(
    body: ClaimRequest,
    access: ClaimAccessDependency,
    request: Request,
    response: Response,
    operation=Depends(handler("claim_identity")),
):
    result = operation.handle(ClaimIdentity(access, body.member_id, body.alias))
    set_session_cookie(response, request, result.group.id, result.session_token)
    return ClaimResponse(
        group=group_response(result.group, result.member_id, False, operation.clock)
    )


def set_session_cookie(response: Response, request: Request, group_id: str, session_token: str):
    response.set_cookie(
        cookie_name(group_id),
        session_token,
        max_age=366 * 86400,
        httponly=True,
        secure=request.app.state.container.settings().cookie_secure,
        samesite="strict",
        path="/api",
    )


@router.post("/api/group/session", response_model=ClaimResponse)
def start_session(
    access: EntryAccessDependency,
    request: Request,
    response: Response,
    operation=Depends(handler("start_session")),
):
    result = operation.handle(access)
    if result.session_token:
        set_session_cookie(response, request, result.group.id, result.session_token)
    return ClaimResponse(
        group=group_response(result.group, result.member_id, result.is_creator, operation.clock)
    )


@router.post("/api/group/migration/start", response_model=MigrationStartResponse)
def start_migration(
    body: MigrationStartRequest,
    access: MigrationTargetAccess,
    request: Request,
    response: Response,
    operation=Depends(handler("start_migration")),
):
    result = operation.handle(access)
    response.set_cookie(
        migration_cookie_name(result.id),
        result.binding_token,
        max_age=120,
        httponly=True,
        secure=request.app.state.container.settings().cookie_secure,
        samesite="strict",
        path=MIGRATION_COOKIE_PATH,
    )
    return MigrationStartResponse(id=result.id)


@router.post("/api/group/migration/authorize", response_model=MigrationAuthorizeResponse)
def authorize_migration(
    body: MigrationIdRequest,
    access: MigrationSourceAccess,
    operation=Depends(handler("authorize_migration")),
):
    return MigrationAuthorizeResponse(code=operation.handle(access, str(body.id)))


def migration_binding(request: Request, migration_id: str) -> str | None:
    raw = request.cookies.get(migration_cookie_name(migration_id))
    return token_hash(raw) if raw else None


@router.post("/api/group/migration/redeem", status_code=204)
def redeem_migration(
    body: MigrationRedeemRequest,
    access: MigrationTargetAccess,
    request: Request,
    response: Response,
    operation=Depends(handler("redeem_migration")),
):
    migration_id = str(body.id)
    raw = operation.handle(
        access, migration_id, migration_binding(request, migration_id), token_hash(body.code)
    )
    assert access.group_id is not None
    set_session_cookie(response, request, access.group_id, raw)


@router.post("/api/group/migration/confirm", response_model=ClaimResponse)
def confirm_migration(
    body: MigrationIdRequest,
    access: MigrationTargetAccess,
    request: Request,
    response: Response,
    operation=Depends(handler("confirm_migration")),
):
    migration_id = str(body.id)
    result = operation.handle(access, migration_id, migration_binding(request, migration_id))
    response.delete_cookie(
        migration_cookie_name(migration_id),
        httponly=True,
        secure=request.app.state.container.settings().cookie_secure,
        samesite="strict",
        path=MIGRATION_COOKIE_PATH,
    )
    return ClaimResponse(
        group=group_response(
            result.group, result.actor.member_id, result.actor.is_creator, operation.clock
        )
    )


@router.post("/api/group/members", response_model=MemberResponse, status_code=201)
def add_member(
    body: AddMemberRequest, access: AccessDependency, operation=Depends(handler("add_member"))
):
    return operation.handle(access, body.alias)


@router.put("/api/group/members/{member_id}", response_model=MemberResponse)
def rename_member(
    member_id: str,
    body: RenameMemberRequest,
    access: AccessDependency,
    operation=Depends(handler("rename_member")),
):
    return operation.handle(access, member_id, body.alias, body.version)


@router.post("/api/group/members/{member_id}/release", response_model=MemberResponse)
def release_member(
    member_id: str,
    body: VersionRequest,
    access: AccessDependency,
    operation=Depends(handler("release_member")),
):
    return operation.handle(access, member_id, body.version)


@router.delete("/api/group/members/{member_id}", status_code=204)
def delete_member(
    member_id: str,
    access: AccessDependency,
    version: Annotated[int, Query(ge=1)],
    operation=Depends(handler("delete_member")),
):
    operation.handle(access, member_id, version)
    return Response(status_code=204)


@router.post("/api/group/movements", response_model=MovementResponse, status_code=201)
def add_movement(
    body: MovementRequest, access: AccessDependency, operation=Depends(handler("add_movement"))
):
    return MovementResponse.from_movement(operation.handle(access, movement_input(body)))


@router.put("/api/group/movements/{movement_id}", response_model=MovementResponse)
def edit_movement(
    movement_id: str,
    body: EditMovementRequest,
    access: AccessDependency,
    operation=Depends(handler("edit_movement")),
):
    return MovementResponse.from_movement(
        operation.handle(access, movement_id, movement_input(body), body.version)
    )


@router.delete("/api/group/movements/{movement_id}", status_code=204)
def delete_movement(
    movement_id: str,
    access: AccessDependency,
    version: Annotated[int, Query(ge=1)],
    operation=Depends(handler("delete_movement")),
):
    operation.handle(access, movement_id, version)
    return Response(status_code=204)


@router.get("/api/group/settlement", response_model=SettlementResponse)
def settlement(access: AccessDependency, operation=Depends(handler("read_settlement"))):
    return operation.handle(access)


@router.put("/api/group", response_model=GroupResponse)
def edit_group(
    body: EditGroupRequest, access: AccessDependency, operation=Depends(handler("edit_group"))
):
    group = operation.handle(access, body.name, body.start_date, body.end_date, body.version)
    return group_response(group, group.creator_member_id, True, operation.clock)


@router.delete("/api/group", status_code=204)
def close_group(
    access: AccessDependency,
    request: Request,
    version: Annotated[int, Query(ge=1)],
    operation=Depends(handler("close_group")),
):
    operation.handle(access, version)
    response = Response(status_code=204)
    assert access.group_id is not None
    response.delete_cookie(
        cookie_name(access.group_id),
        path="/api",
        httponly=True,
        secure=request.app.state.container.settings().cookie_secure,
        samesite="strict",
    )
    return response


@router.get("/api/internal/expire", response_model=ExpiryResponse)
def expire(request: Request, operation=Depends(handler("expire_groups"))):
    expected = request.app.state.container.settings().cron_secret
    actual = request.headers.get("authorization", "")
    if not expected or not secrets.compare_digest(actual, f"Bearer {expected}"):
        raise Forbidden("cron_forbidden", "Acceso no permitido.")
    return ExpiryResponse(deleted=operation.handle())
