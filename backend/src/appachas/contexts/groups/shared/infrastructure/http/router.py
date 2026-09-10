import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from psycopg import Connection

from appachas.contexts.groups.group_creation.public import CreateGroup
from appachas.contexts.groups.identity_claim.public import ClaimIdentity
from appachas.contexts.groups.movement_management.public import MovementInput
from appachas.contexts.groups.settlement.public import calculate
from appachas.contexts.groups.shared.domain.errors import Forbidden
from appachas.contexts.groups.shared.infrastructure.http.dependencies import (
    AccessDependency,
    bearer_token,
    connection,
    cookie_name,
    handler,
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
    MovementRequest,
    MovementResponse,
    Problem,
    RenameMemberRequest,
    SettlementResponse,
    VersionRequest,
)

router = APIRouter(responses={code: {"model": Problem} for code in (403, 404, 409, 422, 429, 500)})


def group_response(group, member_id: str, creator: bool, clock) -> GroupResponse:
    metadata = MetadataResponse.from_group(group, clock.today(group.timezone))
    settlement = SettlementResponse.model_validate(calculate(group))
    return GroupResponse(
        **metadata.model_dump(),
        role="creator" if creator else "member",
        my_member_id=member_id,
        movements=[MovementResponse.model_validate(m) for m in group.movements],
        balances=settlement.balances,
        payments=settlement.payments,
        settlement_text=settlement.text,
        total_cents=settlement.total_cents,
    )


def movement_input(body: MovementRequest) -> MovementInput:
    return MovementInput(
        body.type,
        body.amount,
        body.concept,
        body.date,
        body.payer_id,
        body.participant_ids,
        [(a.member_id, a.amount) for a in body.allocations]
        if body.allocations is not None
        else None,
    )


@router.get("/api/health", response_model=HealthResponse)
def health(current: Annotated[Connection, Depends(connection)]):
    current.execute("SELECT 1")
    return HealthResponse(status="ok")


@router.post("/api/groups", response_model=CreateGroupResponse, status_code=201)
def create_group(
    body: CreateGroupRequest, request: Request, operation=Depends(handler("create_group"))
):
    result = operation.handle(CreateGroup(**body.model_dump()))
    origin = str(request.base_url).rstrip("/")
    return CreateGroupResponse(
        creator_token=result.creator_token,
        member_token=result.member_token,
        creator_url=f"{origin}/g#{result.creator_token}",
        member_url=f"{origin}/g#{result.member_token}",
        group=group_response(result.group, result.group.creator_member_id, True, operation.clock),
    )


@router.get("/api/group/metadata", response_model=MetadataResponse)
def metadata(access: AccessDependency, operation=Depends(handler("read_metadata"))):
    group = operation.handle(access)
    return MetadataResponse.from_group(group, operation.clock.today(group.timezone))


@router.get("/api/group", response_model=GroupResponse)
def read_group(access: AccessDependency, operation=Depends(handler("read_group"))):
    view = operation.handle(access)
    return group_response(view.group, view.actor.member_id, view.actor.is_creator, operation.clock)


@router.post("/api/group/claims", response_model=ClaimResponse)
def claim_identity(
    body: ClaimRequest,
    access: AccessDependency,
    request: Request,
    response: Response,
    operation=Depends(handler("claim_identity")),
):
    result = operation.handle(ClaimIdentity(access, body.member_id, body.alias))
    response.set_cookie(
        cookie_name(bearer_token(request)),
        result.session_token,
        max_age=366 * 86400,
        httponly=True,
        secure=request.app.state.container.settings().cookie_secure,
        samesite="strict",
        path="/api",
    )
    return ClaimResponse(
        group=group_response(result.group, result.member_id, False, operation.clock)
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
    return operation.handle(access, movement_input(body))


@router.put("/api/group/movements/{movement_id}", response_model=MovementResponse)
def edit_movement(
    movement_id: str,
    body: EditMovementRequest,
    access: AccessDependency,
    operation=Depends(handler("edit_movement")),
):
    return operation.handle(access, movement_id, movement_input(body), body.version)


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
    version: Annotated[int, Query(ge=1)],
    operation=Depends(handler("close_group")),
):
    operation.handle(access, version)
    return Response(status_code=204)


@router.get("/api/internal/expire", response_model=ExpiryResponse)
def expire(request: Request, operation=Depends(handler("expire_groups"))):
    expected = request.app.state.container.settings().cron_secret
    actual = request.headers.get("authorization", "")
    if not expected or not secrets.compare_digest(actual, f"Bearer {expected}"):
        raise Forbidden("cron_forbidden", "Acceso no permitido.")
    return ExpiryResponse(deleted=operation.handle())
