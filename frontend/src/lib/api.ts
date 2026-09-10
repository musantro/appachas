import type { paths } from "./api.generated";

type JsonResponse<T> = T extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : T extends {
        responses: { 201: { content: { "application/json": infer R } } };
      }
    ? R
    : never;
type JsonRequest<T> = T extends {
  requestBody: { content: { "application/json": infer R } };
}
  ? R
  : never;
export type Group = JsonResponse<paths["/api/group"]["get"]>;
export type Metadata = JsonResponse<paths["/api/group/metadata"]["get"]>;
export type Member = Metadata["members"][number];
export type Movement = Group["movements"][number];
export type MovementInput = JsonRequest<paths["/api/group/movements"]["post"]>;
export type EditMovementInput = JsonRequest<
  paths["/api/group/movements/{movement_id}"]["put"]
>;
export type CreateGroupInput = JsonRequest<paths["/api/groups"]["post"]>;
export type CreateGroupResult = JsonResponse<paths["/api/groups"]["post"]>;
export type ClaimResult = JsonResponse<paths["/api/group/claims"]["post"]>;
export type SessionResult = JsonResponse<paths["/api/group/session"]["post"]>;
export type Settlement = JsonResponse<paths["/api/group/settlement"]["get"]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  groupId?: string,
  method = "GET",
  body?: unknown,
  entryToken?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(groupId ? { "X-Appachas-Group": groupId } : {}),
        ...(entryToken ? { Authorization: `Bearer ${entryToken}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "No se pudo conectar. Comprueba tu conexión y vuelve a intentarlo.",
    );
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      typeof problem?.code === "string" ? problem.code : "request_failed",
      typeof problem?.detail === "string"
        ? problem.detail
        : "No se pudo completar la acción. Vuelve a intentarlo.",
      problem?.fields ?? {},
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  createGroup: (input: CreateGroupInput) =>
    request<CreateGroupResult>("/groups", undefined, "POST", input),
  group: (groupId: string) => request<Group>("/group", groupId),
  metadata: (entryToken: string) =>
    request<Metadata>(
      "/group/metadata",
      undefined,
      "GET",
      undefined,
      entryToken,
    ),
  startSession: (entryToken: string, groupId: string) =>
    request<SessionResult>(
      "/group/session",
      groupId,
      "POST",
      undefined,
      entryToken,
    ),
  claimInitial: (
    entryToken: string,
    groupId: string,
    input: JsonRequest<paths["/api/group/claims"]["post"]>,
  ) =>
    request<ClaimResult>("/group/claims", groupId, "POST", input, entryToken),
  claim: (
    groupId: string,
    input: JsonRequest<paths["/api/group/claims"]["post"]>,
  ) => request<ClaimResult>("/group/claims", groupId, "POST", input),
  createMovement: (groupId: string, input: MovementInput) =>
    request<Movement>("/group/movements", groupId, "POST", input),
  updateMovement: (groupId: string, id: string, input: EditMovementInput) =>
    request<Movement>(
      `/group/movements/${encodeURIComponent(id)}`,
      groupId,
      "PUT",
      input,
    ),
  deleteMovement: (groupId: string, id: string, version: number) =>
    request<void>(
      `/group/movements/${encodeURIComponent(id)}?version=${version}`,
      groupId,
      "DELETE",
    ),
  updateGroup: (
    groupId: string,
    input: JsonRequest<paths["/api/group"]["put"]>,
  ) => request<Group>("/group", groupId, "PUT", input),
  addMember: (groupId: string, alias: string) =>
    request<Member>("/group/members", groupId, "POST", { alias }),
  renameMember: (groupId: string, member: Member, alias: string) =>
    request<Member>(
      `/group/members/${encodeURIComponent(member.id)}`,
      groupId,
      "PUT",
      { alias, version: member.version },
    ),
  removeMember: (groupId: string, member: Member) =>
    request<void>(
      `/group/members/${encodeURIComponent(member.id)}?version=${member.version}`,
      groupId,
      "DELETE",
    ),
  releaseMember: (groupId: string, member: Member) =>
    request<Member>(
      `/group/members/${encodeURIComponent(member.id)}/release`,
      groupId,
      "POST",
      { version: member.version },
    ),
  settlement: (groupId: string) =>
    request<Settlement>("/group/settlement", groupId),
  closeGroup: (groupId: string, version: number) =>
    request<void>(`/group?version=${version}`, groupId, "DELETE"),
};
