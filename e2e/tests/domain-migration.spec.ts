import {
  type APIRequestContext,
  type BrowserContext,
  devices,
  type Page,
} from "@playwright/test";
import {
  type CreatedGroup,
  expect,
  expenseInput,
  json,
  type Member,
  rejected,
  test,
} from "../support";

const source = process.env.MIGRATION_SOURCE_ORIGIN ?? "";
const target = process.env.MIGRATION_TARGET_ORIGIN ?? "";
function localOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
const localPair =
  localOrigin(source) &&
  localOrigin(target) &&
  new URL(source).hostname !== new URL(target).hostname &&
  (!process.env.E2E_BASE_URL || localOrigin(process.env.E2E_BASE_URL));

function headers(origin: string, groupId: string) {
  return { Origin: origin, "X-Appachas-Group": groupId };
}

function groupRequest(
  client: APIRequestContext,
  origin: string,
  groupId: string,
) {
  return client.get(`${origin}/api/group`, {
    headers: headers(origin, groupId),
  });
}

function phase(
  client: APIRequestContext,
  origin: string,
  groupId: string,
  name: string,
  data: unknown = {},
) {
  return client.post(`${origin}/api/group/migration/${name}`, {
    headers: headers(origin, groupId),
    data,
  });
}

function creatorToken(created: CreatedGroup) {
  return new URL(created.creatorUrl, target).hash.slice(1);
}

function oldLink(created: CreatedGroup, role: "member" | "creator" = "member") {
  return `${source}/g#${role === "creator" ? creatorToken(created) : created.memberToken}`;
}

async function establish(
  client: APIRequestContext,
  origin: string,
  created: CreatedGroup,
  role: "member" | "creator",
  memberIndex = 1,
) {
  return json(
    await client.post(
      `${origin}/api/group/${role === "creator" ? "session" : "claims"}`,
      {
        headers: {
          ...headers(origin, created.group.id),
          Authorization: `Bearer ${role === "creator" ? creatorToken(created) : created.memberToken}`,
        },
        ...(role === "member"
          ? { data: { member_id: created.group.members[memberIndex].id } }
          : {}),
      },
    ),
  );
}

async function observe(page: Page, created: CreatedGroup) {
  const secrets = new Set([creatorToken(created), created.memberToken]);
  for (const cookie of await page.context().cookies())
    secrets.add(cookie.value);
  const requests: {
    url: string;
    referer: string;
    path: string;
    bearer: boolean;
  }[] = [];
  const navigations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (![source, target].includes(url.origin)) return;
    requests.push({
      url: request.url(),
      referer: request.headers().referer ?? "",
      path: url.pathname,
      bearer: !!request.headers().authorization,
    });
    if (url.pathname.endsWith("/migration/redeem")) {
      const data = request.postDataJSON();
      if (typeof data?.code === "string") secrets.add(data.code);
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame() || !frame.url().startsWith("http")) return;
    const origin = new URL(frame.url()).origin;
    if (navigations.at(-1) !== origin) navigations.push(origin);
  });
  return { secrets, requests, navigations };
}

async function atGroup(page: Page, groupId: string, path = "/g") {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        origin: url.origin,
        path: url.pathname,
        group: url.searchParams.get("group"),
        clean: !url.hash,
      };
    })
    .toEqual({ origin: target, path, group: groupId, clean: true });
  await expect(
    page.getByRole("link", { name: "Movimientos", exact: true }),
  ).toBeVisible();
}

async function privacy(
  page: Page,
  context: BrowserContext,
  recorded: Awaited<ReturnType<typeof observe>>,
) {
  const cookies = await context.cookies();
  for (const cookie of cookies) recorded.secrets.add(cookie.value);
  expect(
    cookies
      .filter((cookie) => cookie.name.startsWith("appachas_"))
      .every((cookie) => cookie.httpOnly && cookie.sameSite === "Strict"),
  ).toBe(true);
  const secrets = [...recorded.secrets];
  expect(
    recorded.requests.every((request) =>
      secrets.every(
        (secret) =>
          !request.url.includes(secret) && !request.referer.includes(secret),
      ),
    ),
  ).toBe(true);
  expect(
    recorded.requests
      .filter((request) => request.path.includes("/migration/"))
      .every((request) => !request.bearer),
  ).toBe(true);
  expect(
    await page.evaluate((values) => {
      const persisted = JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        history: history.state,
        url: location.href,
      });
      return values.every((value) => !persisted.includes(value));
    }, secrets),
  ).toBe(true);
}

async function sessionData(
  client: APIRequestContext,
  origin: string,
  groupId: string,
) {
  return json(await groupRequest(client, origin, groupId));
}

function financialState(group: Awaited<ReturnType<typeof sessionData>>) {
  return {
    // Session handoff may advance optimistic-lock versions, not product data.
    members: group.members.map(
      ({ version: _version, ...member }: Member) => member,
    ),
    movements: group.movements,
    balances: group.balances,
    payments: group.payments,
    total_cents: group.total_cents,
  };
}

test.describe("local two-origin session migration", () => {
  test.skip(
    !localPair,
    "Requires explicit isolated local migration origins; never runs against production",
  );

  for (const browserName of ["chromium", "webkit"] as const) {
    for (const role of ["member", "creator"] as const) {
      test(`${browserName}: an occupied ${role} identity transfers once and repeated old URLs reuse the destination`, async ({
        playwright,
        groups,
      }) => {
        // Arrange / Given: cleanup has its own independent creator session.
        const created = await groups.create();
        await created.creator.write(
          "POST",
          "/movements",
          expenseInput(created.group),
        );
        const browser = await playwright[browserName].launch();
        try {
          const context = await browser.newContext({
            ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"],
            baseURL: target,
          });
          await establish(context.request, source, created, role);
          const before = await sessionData(
            context.request,
            source,
            created.group.id,
          );
          expect(
            (await context.cookies()).some(
              (cookie) =>
                cookie.domain === new URL(target).hostname &&
                cookie.name === `appachas_${created.group.id}`,
            ),
          ).toBe(false);
          const page = await context.newPage();
          const recorded = await observe(page, created);

          // Act / When: enter an existing clean legacy bookmark, preserving its route.
          await page.goto(`${source}/g/options?group=${created.group.id}`);
          await atGroup(page, created.group.id, "/g/options");

          // Assert / Then
          const migrated = await sessionData(
            context.request,
            target,
            created.group.id,
          );
          expect(migrated.role).toBe(role);
          expect(migrated.my_member_id).toBe(before.my_member_id);
          expect(financialState(migrated)).toEqual(financialState(before));
          await rejected(
            await groupRequest(context.request, source, created.group.id),
            403,
            "identity_required",
          );
          await expect(
            page.getByRole("button", {
              name: "Confirmar identidad",
              exact: true,
            }),
          ).toHaveCount(0);
          const starts = recorded.requests.filter((request) =>
            request.path.endsWith("/migration/start"),
          ).length;
          expect(starts).toBe(1);
          expect(recorded.navigations.length).toBeLessThanOrEqual(8);
          await privacy(page, context, recorded);

          await page.goto(oldLink(created, role));
          await atGroup(page, created.group.id);
          await page.reload();
          await atGroup(page, created.group.id);
          expect(
            (await sessionData(context.request, target, created.group.id))
              .my_member_id,
          ).toBe(before.my_member_id);
          expect(
            recorded.requests.filter((request) =>
              request.path.endsWith("/migration/start"),
            ).length,
          ).toBe(starts);
          expect(recorded.navigations.length).toBeLessThanOrEqual(12);
          await privacy(page, context, recorded);
        } finally {
          await browser.close();
        }
      });
    }

    test(`${browserName}: a new legacy invitation works after another group has already migrated`, async ({
      playwright,
      groups,
    }) => {
      // Arrange / Given
      const first = await groups.create();
      const second = await groups.create({ name: "Otro grupo" });
      const browser = await playwright[browserName].launch();
      try {
        const context = await browser.newContext({
          ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"],
          baseURL: target,
        });
        await establish(context.request, source, first, "member");
        const page = await context.newPage();
        const recorded = await observe(page, first);
        recorded.secrets.add(creatorToken(second));
        recorded.secrets.add(second.memberToken);
        await page.goto(oldLink(first));
        await atGroup(page, first.group.id);

        // Act / When: this second group has no session on either hostname yet.
        await page.goto(oldLink(second));
        await expect(page.getByRole("radio", { name: /Bruno/ })).toBeEnabled();
        expect(new URL(page.url()).origin).toBe(target);
        await page.getByRole("radio", { name: /Bruno/ }).check();
        await page
          .getByRole("button", { name: "Confirmar identidad", exact: true })
          .click();
        await atGroup(page, second.group.id);

        // Assert / Then: each group retains its own destination cookie and identity.
        expect(
          (await sessionData(context.request, target, first.group.id))
            .my_member_id,
        ).toBe(first.group.members[1].id);
        expect(
          (await sessionData(context.request, target, second.group.id))
            .my_member_id,
        ).toBe(second.group.members[1].id);
        await page.goto(oldLink(first));
        await atGroup(page, first.group.id);
        expect(recorded.navigations.length).toBeLessThanOrEqual(18);
        await privacy(page, context, recorded);
      } finally {
        await browser.close();
      }
    });

    test(`${browserName}: an existing different destination identity is never overwritten`, async ({
      playwright,
      groups,
    }) => {
      // Arrange / Given
      const created = await groups.create();
      const browser = await playwright[browserName].launch();
      try {
        const context = await browser.newContext({
          ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"],
          baseURL: target,
        });
        await establish(context.request, source, created, "creator");
        await establish(context.request, target, created, "member", 2);
        const page = await context.newPage();
        const recorded = await observe(page, created);

        // Act / When
        await page.goto(oldLink(created, "creator"));
        await atGroup(page, created.group.id);

        // Assert / Then: opening the old privileged link does not clobber Carla.
        const destination = await sessionData(
          context.request,
          target,
          created.group.id,
        );
        expect(destination.role).toBe("member");
        expect(destination.my_member_id).toBe(created.group.members[2].id);
        expect(
          (await sessionData(context.request, source, created.group.id)).role,
        ).toBe("creator");
        expect(
          recorded.requests.filter((request) =>
            request.path.includes("/migration/"),
          ).length,
        ).toBe(0);
        expect(recorded.navigations.length).toBeLessThanOrEqual(4);
        await privacy(page, context, recorded);

        // A direct fallback callback must perform the same destination check.
        // Its valid creator link must not replace an already active member.
        const callback = new URLSearchParams({
          phase: "fallback",
          group: created.group.id,
          path: "/g",
          token: creatorToken(created),
        });
        await page.goto(`${target}/g/migrate#${callback}`);
        await atGroup(page, created.group.id);
        const afterCallback = await sessionData(
          context.request,
          target,
          created.group.id,
        );
        expect(afterCallback.role).toBe("member");
        expect(afterCallback.my_member_id).toBe(created.group.members[2].id);
        expect(
          recorded.requests.some((request) =>
            ["/api/group/session", "/api/group/claims"].includes(request.path),
          ),
        ).toBe(false);
        await privacy(page, context, recorded);
      } finally {
        await browser.close();
      }
    });

    test(`${browserName}: deleting cookies cannot resurrect the revoked source or steal an occupied member`, async ({
      playwright,
      groups,
    }) => {
      // Arrange / Given
      const created = await groups.create();
      const browser = await playwright[browserName].launch();
      try {
        const context = await browser.newContext({
          ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"],
          baseURL: target,
        });
        await establish(context.request, source, created, "member");
        const page = await context.newPage();
        const recorded = await observe(page, created);
        await page.goto(oldLink(created));
        await atGroup(page, created.group.id);

        // Act / When: the old cookie still exists but its session was revoked.
        await context.clearCookies({ domain: new URL(target).hostname });
        await page.goto(oldLink(created));

        // Assert / Then
        await expect(page.getByRole("radio", { name: /Bruno/ })).toBeDisabled();
        expect(new URL(page.url()).origin).toBe(target);
        await rejected(
          await groupRequest(context.request, target, created.group.id),
          403,
          "identity_required",
        );
        await rejected(
          await groupRequest(context.request, source, created.group.id),
          403,
          "identity_required",
        );
        await context.clearCookies();
        await page.goto(oldLink(created));
        await expect(page.getByRole("radio", { name: /Bruno/ })).toBeDisabled();
        await page.getByRole("radio", { name: /Carla/ }).check();
        await page
          .getByRole("button", { name: "Confirmar identidad", exact: true })
          .click();
        await atGroup(page, created.group.id);
        expect(
          (await sessionData(context.request, target, created.group.id))
            .my_member_id,
        ).toBe(created.group.members[2].id);

        // A creator who still holds the private link can recover after cookie loss.
        await context.clearCookies();
        await page.goto(oldLink(created, "creator"));
        await atGroup(page, created.group.id);
        expect(
          (await sessionData(context.request, target, created.group.id)).role,
        ).toBe("creator");
        expect(recorded.navigations.length).toBeLessThanOrEqual(30);
        await privacy(page, context, recorded);
      } finally {
        await browser.close();
      }
    });

    test(`${browserName}: losing the successful confirmation response still recovers the active destination cookie`, async ({
      playwright,
      groups,
    }) => {
      // Arrange / Given
      const created = await groups.create();
      const browser = await playwright[browserName].launch();
      try {
        const context = await browser.newContext({
          ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"],
          baseURL: target,
        });
        await establish(context.request, source, created, "member");
        const page = await context.newPage();
        const recorded = await observe(page, created);
        const confirmationStatuses: number[] = [];
        await page.route("**/api/group/migration/confirm", async (route) => {
          // Execute the real backend transaction; drop only its network response.
          const response = await route.fetch();
          confirmationStatuses.push(response.status());
          await route.abort("failed");
        });

        // Act / When
        await page.goto(oldLink(created));
        await atGroup(page, created.group.id);

        // Assert / Then
        expect(confirmationStatuses).toEqual([200]);
        expect(
          (await sessionData(context.request, target, created.group.id))
            .my_member_id,
        ).toBe(created.group.members[1].id);
        await rejected(
          await groupRequest(context.request, source, created.group.id),
          403,
          "identity_required",
        );
        await page.reload();
        await atGroup(page, created.group.id);
        expect(confirmationStatuses).toHaveLength(1);
        await privacy(page, context, recorded);
      } finally {
        await browser.close();
      }
    });
  }

  test("HTTP transfer requires browser binding, one-use code and confirmation before revoking the source", async ({
    groups,
    playwright,
  }) => {
    // Arrange / Given
    const created = await groups.create();
    const sourceClient = await playwright.request.newContext();
    const destination = await playwright.request.newContext();
    const stranger = await playwright.request.newContext();
    try {
      await establish(sourceClient, source, created, "member");
      const before = await sessionData(sourceClient, source, created.group.id);
      await rejected(
        await phase(destination, source, created.group.id, "start"),
        403,
        "migration_origin_forbidden",
      );
      const { id } = await json(
        await phase(destination, target, created.group.id, "start"),
      );
      const binding = (await destination.storageState()).cookies.find(
        (cookie) => cookie.name === `appachas_migration_binding_${id}`,
      );
      expect(
        !!binding &&
          binding.httpOnly &&
          binding.sameSite === "Strict" &&
          binding.path === "/api/group/migration",
      ).toBe(true);
      expect(binding?.domain).toBe(new URL(target).hostname);
      const { code } = await json(
        await phase(sourceClient, source, created.group.id, "authorize", {
          id,
        }),
      );

      // Act / When: knowing the ticket/code is insufficient in another browser.
      await rejected(
        await phase(stranger, target, created.group.id, "redeem", { id, code }),
        403,
        "migration_invalid",
      );
      await rejected(
        await phase(destination, target, created.group.id, "redeem", {
          id,
          code: "x".repeat(43),
        }),
        403,
      );
      await json(
        await phase(destination, target, created.group.id, "redeem", {
          id,
          code,
        }),
      );

      // Assert / Then: pending destination cannot authorize anything yet.
      await rejected(
        await groupRequest(destination, target, created.group.id),
        403,
        "identity_required",
      );
      expect(
        (await sessionData(sourceClient, source, created.group.id))
          .my_member_id,
      ).toBe(before.my_member_id);
      await rejected(
        await phase(sourceClient, source, created.group.id, "authorize", {
          id,
        }),
        409,
        "migration_used",
      );
      await rejected(
        await phase(destination, target, created.group.id, "redeem", {
          id,
          code,
        }),
        409,
        "migration_used",
      );
      await rejected(
        await phase(stranger, target, created.group.id, "confirm", { id }),
        403,
        "migration_invalid",
      );
      const confirmed = await json(
        await phase(destination, target, created.group.id, "confirm", { id }),
      );
      expect(confirmed.group.my_member_id).toBe(before.my_member_id);
      expect(financialState(confirmed.group)).toEqual(financialState(before));
      await rejected(
        await groupRequest(sourceClient, source, created.group.id),
        403,
        "identity_required",
      );
      expect(
        (await sessionData(destination, target, created.group.id)).my_member_id,
      ).toBe(before.my_member_id);
      expect(
        (await destination.storageState()).cookies.some(
          (cookie) => cookie.name === `appachas_migration_binding_${id}`,
        ),
      ).toBe(false);
    } finally {
      await Promise.all([
        sourceClient.dispose(),
        destination.dispose(),
        stranger.dispose(),
      ]);
    }
  });

  test("HTTP aborting after redemption leaves the source active and the destination unauthorized", async ({
    groups,
    playwright,
  }) => {
    // Arrange / Given
    const created = await groups.create();
    const sourceClient = await playwright.request.newContext();
    const destination = await playwright.request.newContext();
    try {
      await establish(sourceClient, source, created, "creator");
      const before = await sessionData(sourceClient, source, created.group.id);
      const { id } = await json(
        await phase(destination, target, created.group.id, "start"),
      );
      const { code } = await json(
        await phase(sourceClient, source, created.group.id, "authorize", {
          id,
        }),
      );

      // Act / When: intentionally never send confirmation.
      await json(
        await phase(destination, target, created.group.id, "redeem", {
          id,
          code,
        }),
      );

      // Assert / Then
      await rejected(
        await groupRequest(destination, target, created.group.id),
        403,
        "identity_required",
      );
      const unchanged = await sessionData(
        sourceClient,
        source,
        created.group.id,
      );
      expect(unchanged.role).toBe("creator");
      expect(financialState(unchanged)).toEqual(financialState(before));
    } finally {
      await Promise.all([sourceClient.dispose(), destination.dispose()]);
    }
  });

  test("HTTP redemption cannot overwrite a destination identity claimed while transfer was in progress", async ({
    groups,
    playwright,
  }) => {
    // Arrange / Given
    const created = await groups.create();
    const sourceClient = await playwright.request.newContext();
    const destination = await playwright.request.newContext();
    try {
      await establish(sourceClient, source, created, "member");
      const { id } = await json(
        await phase(destination, target, created.group.id, "start"),
      );
      const { code } = await json(
        await phase(sourceClient, source, created.group.id, "authorize", {
          id,
        }),
      );
      await establish(destination, target, created, "member", 2);

      // Act / When
      await rejected(
        await phase(destination, target, created.group.id, "redeem", {
          id,
          code,
        }),
        409,
        "migration_target_occupied",
      );

      // Assert / Then
      expect(
        (await sessionData(destination, target, created.group.id)).my_member_id,
      ).toBe(created.group.members[2].id);
      expect(
        (await sessionData(sourceClient, source, created.group.id))
          .my_member_id,
      ).toBe(created.group.members[1].id);
    } finally {
      await Promise.all([sourceClient.dispose(), destination.dispose()]);
    }
  });
});
