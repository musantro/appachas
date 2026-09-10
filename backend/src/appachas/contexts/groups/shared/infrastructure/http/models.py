from dataclasses import asdict
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from appachas.contexts.groups.shared.domain.models import Group, Movement


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateGroupRequest(RequestModel):
    name: str = Field(max_length=100)
    start_date: date
    end_date: date
    timezone: str = Field(max_length=100)
    members: list[str] = Field(min_length=2, max_length=50)
    creator_index: int = Field(ge=0, le=49)


class ClaimRequest(RequestModel):
    member_id: str = Field(max_length=36)
    alias: str | None = Field(default=None, max_length=100)


class MigrationStartRequest(RequestModel):
    pass


class MigrationIdRequest(RequestModel):
    id: UUID


class MigrationRedeemRequest(MigrationIdRequest):
    code: str = Field(min_length=40, max_length=256, pattern=r"^[A-Za-z0-9_-]+$")


class AddMemberRequest(RequestModel):
    alias: str = Field(max_length=100)


class VersionRequest(RequestModel):
    version: int = Field(ge=1)


class RenameMemberRequest(AddMemberRequest, VersionRequest):
    pass


class EditGroupRequest(VersionRequest):
    name: str = Field(max_length=100)
    start_date: date
    end_date: date


class AllocationRequest(RequestModel):
    member_id: str = Field(max_length=36)
    amount: str = Field(max_length=30)


class MovementRequest(RequestModel):
    type: Literal["expense", "refund", "contribution"]
    amount: str = Field(max_length=30)
    concept: str = Field(default="", max_length=200)
    date: date
    payer_id: str = Field(max_length=36)
    participant_ids: list[str] = Field(default_factory=list, max_length=50)
    allocations: list[AllocationRequest] | None = Field(default=None, max_length=50)


class EditMovementRequest(MovementRequest, VersionRequest):
    pass


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MemberResponse(ResponseModel):
    id: str
    alias: str
    position: int
    claimed: bool
    is_creator: bool
    version: int


class MetadataResponse(ResponseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    timezone: str
    today: date
    version: int
    creator_member_id: str
    members: list[MemberResponse]
    access_role: Literal["creator", "member"] | None = None

    @classmethod
    def from_group(cls, group: Group, today: date):
        return cls(
            id=group.id,
            name=group.name,
            start_date=group.start_date,
            end_date=group.end_date,
            timezone=group.timezone,
            today=today,
            version=group.version,
            creator_member_id=group.creator_member_id,
            members=[MemberResponse.model_validate(m) for m in group.members],
        )


class AllocationResponse(ResponseModel):
    member_id: str
    amount_cents: int


class MovementResponse(ResponseModel):
    id: str
    type: Literal["expense", "refund", "contribution"]
    amount_cents: int
    concept: str
    date: date
    payer_id: str
    allocations: list[AllocationResponse]
    created_at: datetime
    updated_at: datetime
    version: int

    @classmethod
    def from_movement(cls, movement: Movement):
        # Domain and storage keep positive magnitudes. The HTTP presentation
        # remains signed so history can display refunds without extra arithmetic.
        data = asdict(movement)
        sign = -1 if movement.type == "refund" else 1
        data["amount_cents"] *= sign
        for allocation in data["allocations"]:
            allocation["amount_cents"] *= sign
        return cls.model_validate(data)


class BalanceResponse(ResponseModel):
    member_id: str
    alias: str
    amount_cents: int


class PaymentResponse(ResponseModel):
    from_member_id: str
    to_member_id: str
    amount_cents: int


class SettlementResponse(ResponseModel):
    balances: list[BalanceResponse]
    payments: list[PaymentResponse]
    text: str
    total_cents: int


class GroupResponse(MetadataResponse):
    role: Literal["creator", "member"]
    my_member_id: str
    movements: list[MovementResponse]
    balances: list[BalanceResponse]
    payments: list[PaymentResponse]
    settlement_text: str
    total_cents: int


class CreateGroupResponse(ResponseModel):
    creator_token: str
    member_token: str
    creator_url: str
    member_url: str
    group: GroupResponse


class ClaimResponse(ResponseModel):
    group: GroupResponse


class MigrationStartResponse(ResponseModel):
    id: UUID


class MigrationAuthorizeResponse(ResponseModel):
    code: str


class Problem(ResponseModel):
    type: str
    title: str
    status: int
    detail: str
    code: str
    fields: dict[str, str] = Field(default_factory=dict)


class HealthResponse(ResponseModel):
    status: Literal["ok"]


class ExpiryResponse(ResponseModel):
    deleted: int
