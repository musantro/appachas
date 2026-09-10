import {
  type APIRequestContext,
  type APIResponse,
  test as base,
  expect,
} from "@playwright/test";

export type Member = {
  id: string;
  alias: string;
  position: number;
  claimed: boolean;
  is_creator: boolean;
  version: number;
};

export type Movement = {
  id: string;
  type: "expense" | "refund" | "contribution";
  amount_cents: number;
  concept: string;
  date: string;
  payer_id: string;
  allocations: { member_id: string; amount_cents: number }[];
  created_at: string;
  updated_at: string;
  version: number;
};

export type Group = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  today: string;
  version: number;
  creator_member_id: string;
  members: Member[];
  role: "creator" | "member";
  my_member_id: string;
  movements: Movement[];
  balances: { member_id: string; alias: string; amount_cents: number }[];
  payments: {
    from_member_id: string;
    to_member_id: string;
    amount_cents: number;
  }[];
  settlement_text: string;
  total_cents: number;
};

export function calendarDate(offset = 0, timezone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  const date = new Date(
    `${value("year")}-${value("month")}-${value("day")}T12:00:00Z`,
  );
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function groupInput(overrides: Record<string, unknown> = {}) {
  const timezone =
    typeof overrides.timezone === "string" ? overrides.timezone : "UTC";
  let start = calendarDate();
  let end = calendarDate(7);
  try {
    start = calendarDate(0, timezone);
    end = calendarDate(7, timezone);
  } catch {
    // Invalid timezone scenarios must reach backend validation with valid dates.
  }
  return {
    name: "Acceptance group",
    start_date: start,
    end_date: end,
    timezone: "UTC",
    members: ["Ana", "Bruno", "Carla"],
    creator_index: 0,
    ...overrides,
  };
}

export class GroupClient {
  private identified = false;

  constructor(
    readonly request: APIRequestContext,
    readonly groupId: string,
    private readonly origin: string,
    private readonly token: string,
  ) {}

  async response(method: string, path = "", data?: unknown) {
    const entry =
      path === "/metadata" ||
      path === "/session" ||
      (path === "/claims" && !this.identified);
    const response = await this.request.fetch(`/api/group${path}`, {
      method,
      headers: {
        "X-Appachas-Group": this.groupId,
        Origin: this.origin,
        ...(entry ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      ...(data === undefined ? {} : { data }),
    });
    if (
      response.ok() &&
      (path === "/claims" ||
        path === "/session" ||
        (method === "GET" && path === ""))
    )
      this.identified = true;
    return response;
  }

  async read(): Promise<Group> {
    return json(await this.response("GET"));
  }

  async metadata(): Promise<Group> {
    return json(await this.response("GET", "/metadata"));
  }

  async write(method: string, path: string, data?: unknown) {
    return json(await this.response(method, path, data));
  }
}

export async function json(response: APIResponse) {
  expect(response.status(), "The operation succeeds").toBeGreaterThanOrEqual(
    200,
  );
  expect(response.status(), "The operation succeeds").toBeLessThan(300);
  if (response.status() === 204) return undefined;
  return response.json();
}

export async function rejected(
  response: APIResponse,
  status: number,
  code?: string,
) {
  expect(response.status()).toBe(status);
  const problem = await response.json();
  expect(problem.status).toBe(status);
  expect(typeof problem.detail).toBe("string");
  expect(typeof problem.code).toBe("string");
  if (code) expect(problem.code).toBe(code);
}

export function expenseInput(
  group: Group,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: "expense",
    amount: "10.00",
    concept: "Train tickets",
    date: group.today,
    payer_id: group.members[0].id,
    participant_ids: group.members.map((member) => member.id),
    ...overrides,
  };
}

export type CreatedGroup = {
  creator: GroupClient;
  group: Group;
  creatorUrl: string;
  memberUrl: string;
  memberToken: string;
};

type GroupFactory = {
  create: (overrides?: Record<string, unknown>) => Promise<CreatedGroup>;
  member: (group: CreatedGroup) => Promise<GroupClient>;
  register: (creatorToken: string, groupId: string) => Promise<GroupClient>;
  origin: string;
};

export const test = base.extend<{ groups: GroupFactory }>({
  groups: async ({ request, playwright, baseURL }, use) => {
    if (!baseURL)
      throw new Error("Playwright baseURL must point to the running app");
    const origin = new URL(baseURL).origin;
    const creators: GroupClient[] = [];
    const contexts: APIRequestContext[] = [];
    const register = async (token: string, groupId: string) => {
      const creator = new GroupClient(request, groupId, origin, token);
      creators.push(creator);
      await creator.write("POST", "/session");
      return creator;
    };
    const failures: string[] = [];
    try {
      await use({
        origin,
        register,
        async create(overrides = {}) {
          const response = await request.post("/api/groups", {
            data: groupInput(overrides),
            headers: { Origin: origin },
          });
          const result = await json(response);
          const creator = await register(result.creator_token, result.group.id);
          return {
            creator,
            group: await creator.read(),
            creatorUrl: result.creator_url,
            memberUrl: result.member_url,
            memberToken: result.member_token,
          };
        },
        async member(group) {
          const context = await playwright.request.newContext({ baseURL });
          contexts.push(context);
          return new GroupClient(
            context,
            group.group.id,
            origin,
            group.memberToken,
          );
        },
      });
    } finally {
      // One failed cleanup must not leave the other test groups or contexts open.
      for (const [index, creator] of creators.entries()) {
        let operation = "read";
        try {
          const response = await creator.response("GET");
          if (response.status() === 404) continue;
          if (!response.ok()) {
            failures.push(
              `Group ${index + 1}: read returned HTTP ${response.status()}`,
            );
            continue;
          }
          const group = await response.json();
          operation = "delete";
          const deletion = await creator.response(
            "DELETE",
            `?version=${group.version}`,
          );
          if (!deletion.ok() && deletion.status() !== 404) {
            failures.push(
              `Group ${index + 1}: delete returned HTTP ${deletion.status()}`,
            );
          }
        } catch {
          // Transport errors may contain Authorization headers; never report them.
          failures.push(`Group ${index + 1}: ${operation} failed`);
        }
      }
      const disposed = await Promise.allSettled(
        contexts.map((context) => context.dispose()),
      );
      for (const [index, result] of disposed.entries()) {
        if (result.status === "rejected")
          failures.push(`Context ${index + 1}: disposal failed`);
      }
    }
    if (failures.length)
      throw new Error(`Test cleanup incomplete. ${failures.join("; ")}`);
  },
});

export { expect };
