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
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  group: (token: string) => request<Group>("/group", token),
  metadata: (token: string) => request<Metadata>("/group/metadata", token),
  claim: (
    token: string,
    input: JsonRequest<paths["/api/group/claims"]["post"]>,
  ) => request<ClaimResult>("/group/claims", token, "POST", input),
  createMovement: (token: string, input: MovementInput) =>
    request<Movement>("/group/movements", token, "POST", input),
  updateMovement: (token: string, id: string, input: EditMovementInput) =>
    request<Movement>(
      `/group/movements/${encodeURIComponent(id)}`,
      token,
      "PUT",
      input,
    ),
  deleteMovement: (token: string, id: string, version: number) =>
    request<void>(
      `/group/movements/${encodeURIComponent(id)}?version=${version}`,
      token,
      "DELETE",
    ),
  updateGroup: (
    token: string,
    input: JsonRequest<paths["/api/group"]["put"]>,
  ) => request<Group>("/group", token, "PUT", input),
  addMember: (token: string, alias: string) =>
    request<Member>("/group/members", token, "POST", { alias }),
  renameMember: (token: string, member: Member, alias: string) =>
    request<Member>(
      `/group/members/${encodeURIComponent(member.id)}`,
      token,
      "PUT",
      { alias, version: member.version },
    ),
  removeMember: (token: string, member: Member) =>
    request<void>(
      `/group/members/${encodeURIComponent(member.id)}?version=${member.version}`,
      token,
      "DELETE",
    ),
  releaseMember: (token: string, member: Member) =>
    request<Member>(
      `/group/members/${encodeURIComponent(member.id)}/release`,
      token,
      "POST",
      { version: member.version },
    ),
  settlement: (token: string) =>
    request<Settlement>("/group/settlement", token),
  closeGroup: (token: string, version: number) =>
    request<void>(`/group?version=${version}`, token, "DELETE"),
};
