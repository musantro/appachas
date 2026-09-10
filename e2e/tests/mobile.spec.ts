import AxeBuilder from "@axe-core/playwright";
import { devices, type Page } from "@playwright/test";
import {
  type CreatedGroup,
  calendarDate,
  expect,
  expenseInput,
  type Movement,
  rejected,
  test,
} from "../support";

declare global {
  interface Window {
    acceptanceNative: { copies: string[]; shares: string[] };
    acceptanceRestoreText?: () => void;
  }
}

async function captureNativeActions(page: Page) {
  await page.addInitScript(() => {
    const state = { copies: [] as string[], shares: [] as string[] };
    window.acceptanceNative = state;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        state.shares.push(data.text ?? "");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          state.copies.push(text);
        },
      },
    });
  });
}

function creatorPath(created: CreatedGroup, path = "") {
  return `/g${path}${new URL(created.creatorUrl, "http://localhost").hash}`;
}

async function sessionPrivacy(page: Page, groupId: string, secrets: string[]) {
  await expect
    .poll(async () =>
      page.evaluate(
        ({ id, tokens }) => {
          const url = new URL(window.location.href);
          const storage = JSON.stringify({
            local: { ...localStorage },
            session: { ...sessionStorage },
            history: window.history.state,
          });
          return {
            groupReference: url.searchParams.get("group") === id,
            hashCleared: url.hash === "",
            noPersistedSecrets: tokens.every(
              (secret) =>
                !storage.includes(secret) && !url.href.includes(secret),
            ),
            cookieHiddenFromJavaScript: !document.cookie.includes("appachas_"),
          };
        },
        { id: groupId, tokens: secrets },
      ),
    )
    .toEqual({
      groupReference: true,
      hashCleared: true,
      noPersistedSecrets: true,
      cookieHiddenFromJavaScript: true,
    });
}

async function noHorizontalOverflow(page: Page) {
  const measurement = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .slice(0, 8)
      .map((element) => `${element.tagName}.${String(element.className)}`),
  }));
  expect(
    measurement.content,
    `Overflowing elements: ${measurement.overflowing.join(", ")}`,
  ).toBeLessThanOrEqual(measurement.viewport + 1);
}

async function movementControlsFit(page: Page) {
  const labels = await page.locator(".type-option").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      let node = walker.nextNode();
      while (node) {
        const content = node.textContent ?? "";
        if (content.trim()) {
          const range = document.createRange();
          range.setStart(node, content.search(/\S/));
          range.setEnd(node, content.trimEnd().length);
          rects.push(...Array.from(range.getClientRects()));
        }
        node = walker.nextNode();
      }
      return {
        label: element.textContent?.trim(),
        lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
        contained: rects.every(
          (rect) => rect.left >= box.left && rect.right <= box.right + 1,
        ),
      };
    }),
  );
  expect(labels).toEqual(
    ["Gasto", "Reembolso", "Aportación"].map((label) => ({
      label,
      lines: 1,
      contained: true,
    })),
  );
  const dates = await page
    .locator('input[type="date"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        const field = element.closest(".field")?.getBoundingClientRect();
        const card = element.closest(".card")?.getBoundingClientRect();
        return {
          withinField:
            !!field &&
            box.left >= field.left - 1 &&
            box.right <= field.right + 1,
          withinCard:
            !!card && box.left >= card.left - 1 && box.right <= card.right + 1,
          contentFits: element.scrollWidth <= element.clientWidth + 1,
        };
      }),
    );
  expect(dates.length).toBeGreaterThan(0);
  expect(
    dates.every(
      (date) => date.withinField && date.withinCard && date.contentFits,
    ),
  ).toBe(true);
  await noHorizontalOverflow(page);
  await touchTargets(page);
}

async function withEnlargedText(page: Page, verify: () => Promise<void>) {
  await page.evaluate(() => {
    const sizes = Array.from(
      document.querySelectorAll<HTMLElement>("body,body *"),
    ).map((element) => ({
      element,
      font: Number.parseFloat(getComputedStyle(element).fontSize),
      line: Number.parseFloat(getComputedStyle(element).lineHeight),
      originalFont: element.style.fontSize,
      originalLine: element.style.lineHeight,
    }));
    window.acceptanceRestoreText = () => {
      for (const { element, originalFont, originalLine } of sizes) {
        element.style.fontSize = originalFont;
        element.style.lineHeight = originalLine;
      }
      delete window.acceptanceRestoreText;
    };
    for (const { element, font, line } of sizes) {
      element.style.fontSize = `${font * 2}px`;
      if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px`;
    }
  });
  try {
    await verify();
  } finally {
    await page.evaluate(() => window.acceptanceRestoreText?.());
  }
}

async function accessible(page: Page) {
  await noHorizontalOverflow(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await touchTargets(page);
}

async function touchTargets(page: Page) {
  const smallTargets = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "a,button,input,select,textarea,summary",
      ),
    )
      .filter(
        (element) =>
          element.getClientRects().length && !element.matches(":disabled"),
      )
      .map((element) => {
        const target = element.matches('[type="checkbox"],[type="radio"]')
          ? (element.closest("label") ?? element)
          : element;
        const box = target.getBoundingClientRect();
        return {
          name:
            element.getAttribute("aria-label") ||
            element.getAttribute("id") ||
            element.tagName,
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      })
      .filter((target) => target.width < 44 || target.height < 44),
  );
  expect(smallTargets).toEqual([]);
}

test("mobile claim conflict returns to the selector without occupying another identity", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await page.goto(`/g${new URL(created.memberUrl, groups.origin).hash}`);
  await page.getByRole("radio", { name: /Bruno/ }).check();
  const competingDevice = await groups.member(created);
  await competingDevice.write("POST", "/claims", {
    member_id: created.group.members[1].id,
  });

  // Act / When
  await page
    .getByRole("button", { name: "Confirmar identidad", exact: true })
    .click();

  // Assert / Then
  await expect(page.getByRole("alert")).toHaveText(
    "Este integrante ya está ocupado",
  );
  await expect(page.getByRole("radio", { name: /Bruno/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Confirmar identidad", exact: true }),
  ).toBeDisabled();
  expect((await created.creator.read()).members[2].claimed).toBe(false);
  await page.getByRole("radio", { name: /Carla/ }).check();
  await page
    .getByRole("button", { name: "Confirmar identidad", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Movimientos", exact: true }),
  ).toBeVisible();
});

test("mobile stale edit keeps its form and can load the version saved by another device", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const initial = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { concept: "Original concept" }),
  );
  await page.goto(creatorPath(created, `/movements/${initial.id}`));
  await page.getByLabel("Concepto", { exact: true }).fill("My unsaved change");
  await created.creator.write(
    "PUT",
    `/movements/${initial.id}`,
    expenseInput(created.group, {
      concept: "Other device change",
      version: initial.version,
    }),
  );

  // Act / When
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();

  // Assert / Then
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
    "My unsaved change",
  );
  await expect(
    page.getByRole("button", { name: "Guardar movimiento", exact: true }),
  ).toBeDisabled();
  expect((await created.creator.read()).movements[0].concept).toBe(
    "Other device change",
  );
  await page
    .getByRole("button", { name: "Cargar versión actual", exact: true })
    .click();
  await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
    "Other device change",
  );
  await expect(
    page.getByRole("button", { name: "Guardar movimiento", exact: true }),
  ).toBeEnabled();
});

test("offline saving reports an error and reconnecting never queues a movement without an explicit retry", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await page.goto(creatorPath(created, "/movements/new"));
  await page
    .getByLabel("Concepto", { exact: true })
    .fill("Intento sin conexión");
  await page.getByLabel("Importe total", { exact: true }).fill("12,34");
  await page.context().setOffline(true);
  let automaticWrite: Promise<boolean>;

  // Act / When
  try {
    await page
      .getByRole("button", { name: "Guardar movimiento", exact: true })
      .click();

    // Assert / Then
    await expect(page.getByRole("alert")).toContainText("No se pudo conectar");
    await expect(
      page.getByRole("button", { name: "Guardar movimiento", exact: true }),
    ).toBeEnabled();
    expect((await created.creator.read()).movements).toHaveLength(0);
    automaticWrite = page
      .waitForRequest(
        (request) =>
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/group/movements",
        { timeout: 1000 },
      )
      .then(
        () => true,
        () => false,
      );
  } finally {
    await page.context().setOffline(false);
  }
  expect(await automaticWrite).toBe(false);
  expect((await created.creator.read()).movements).toHaveLength(0);
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Editar Intento sin conexión",
      exact: true,
    }),
  ).toBeVisible();
  expect((await created.creator.read()).movements).toHaveLength(1);
});

test("mobile can save a one-cent contribution split between two recipients", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await page.goto(creatorPath(created, "/movements/new"));
  await page.getByRole("radio", { name: "Aportación", exact: true }).check();
  await page.getByLabel("Importe total", { exact: true }).fill("0,01");
  await page.getByRole("checkbox", { name: "Bruno", exact: true }).check();
  await page.getByRole("checkbox", { name: "Carla", exact: true }).check();
  await expect(
    page.getByLabel("Importe para Bruno", { exact: true }),
  ).toHaveValue("0,01");
  await expect(
    page.getByLabel("Importe para Carla", { exact: true }),
  ).toHaveValue("0,00");

  // Act / When
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();

  // Assert / Then
  await expect(
    page.getByRole("link", { name: "Editar Aportación", exact: true }),
  ).toBeVisible();
  expect(
    (await created.creator.read()).movements[0].allocations.map(
      (item) => item.amount_cents,
    ),
  ).toEqual([1, 0]);
});

test("mobile creator shares the member link and a second device claims a persistent identity", async ({
  page,
  browser,
  groups,
}) => {
  // Arrange / Given
  await captureNativeActions(page);
  await page.goto("/");
  await page
    .getByLabel("Nombre del grupo", { exact: true })
    .fill("Escapada a Gijón");
  await page
    .getByLabel("Fecha de inicio", { exact: true })
    .fill(calendarDate());
  await page.getByLabel("Fecha de fin", { exact: true }).fill(calendarDate(7));
  await page.getByLabel("Integrante 1", { exact: true }).fill("Ana");
  await page.getByLabel("Integrante 2", { exact: true }).fill("Bruno");
  await page
    .getByLabel("¿Quién eres tú?", { exact: true })
    .selectOption({ label: "Ana" });

  // Act / When
  const creation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/groups") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Crear grupo", exact: true }).click();
  const result = await (await creation).json();
  const creator = await groups.register(result.creator_token, result.group.id);

  // Assert / Then
  await expect(
    page.getByLabel("Enlace de integrantes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Enlace de creador", { exact: true }),
  ).toBeVisible();
  expect(
    (await page
      .getByLabel("Enlace de integrantes", { exact: true })
      .inputValue()) !==
      (await page
        .getByLabel("Enlace de creador", { exact: true })
        .inputValue()),
  ).toBe(true);
  const creatorWarning = page.getByText(/no (?:lo )?compartas/i);
  await expect(creatorWarning).toBeVisible();
  await expect(creatorWarning).toContainText(/recuperar|recuperación/i);
  await sessionPrivacy(page, result.group.id, [
    result.creator_token,
    result.member_token,
  ]);
  await page
    .getByRole("button", {
      name: "Compartir enlace de integrantes",
      exact: true,
    })
    .click();
  const shared = await page.evaluate(() => window.acceptanceNative.shares[0]);
  expect(shared.includes(result.member_token)).toBe(true);
  expect(shared.includes(result.creator_token)).toBe(false);
  expect(shared.includes("Escapada a Gijón")).toBe(true);
  expect(/identidad|quién eres|integrante|elige tu nombre/.test(shared)).toBe(
    true,
  );
  const dateLabel = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
  });
  expect(
    shared.includes(dateLabel.format(new Date(`${calendarDate()}T12:00:00`))),
  ).toBe(true);
  expect(
    shared.includes(dateLabel.format(new Date(`${calendarDate(7)}T12:00:00`))),
  ).toBe(true);
  await page.getByRole("link", { name: "Ir al grupo", exact: true }).click();

  const context = await browser.newContext({
    baseURL: groups.origin,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const memberPage = await context.newPage();
    await memberPage.goto(`/g#${result.member_token}`);
    await expect(
      memberPage.getByText("Escapada a Gijón", { exact: true }),
    ).toBeVisible();
    await expect(memberPage.getByRole("radio", { name: /Ana/ })).toBeDisabled();
    await expect(
      memberPage.getByRole("link", { name: "Liquidación", exact: true }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("link", { name: /Añadir movimiento/ }),
    ).toHaveCount(0);
    await memberPage.getByRole("radio", { name: /Bruno/ }).check();
    await memberPage
      .getByLabel("Tu alias (opcional)", { exact: true })
      .fill("Bruno 🧉");
    await memberPage
      .getByRole("button", { name: "Confirmar identidad", exact: true })
      .click();
    await expect(
      memberPage.getByRole("link", { name: "Movimientos", exact: true }),
    ).toBeVisible();
    await sessionPrivacy(memberPage, result.group.id, [
      result.creator_token,
      result.member_token,
    ]);
    const authenticatedRequests: {
      authorization: boolean;
      groupReference: boolean;
      secretFree: boolean;
      method: string;
    }[] = [];
    memberPage.on("request", (request) => {
      if (!new URL(request.url()).pathname.startsWith("/api/group")) return;
      const headers = request.headers();
      const transport = request.url() + (request.postData() ?? "");
      authenticatedRequests.push({
        authorization: Object.hasOwn(headers, "authorization"),
        groupReference: headers["x-appachas-group"] === result.group.id,
        secretFree: [result.creator_token, result.member_token].every(
          (secret) => !transport.includes(secret),
        ),
        method: request.method(),
      });
    });
    await memberPage.reload();
    await expect(
      memberPage.getByRole("link", { name: "Movimientos", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", {
        name: "Confirmar identidad",
        exact: true,
      }),
    ).toHaveCount(0);
    await sessionPrivacy(memberPage, result.group.id, [
      result.creator_token,
      result.member_token,
    ]);
    await memberPage
      .getByRole("link", { name: "Añadir movimiento", exact: true })
      .filter({ visible: true })
      .click();
    await memberPage.getByLabel("Importe total", { exact: true }).fill("0,01");
    await memberPage
      .getByLabel("Concepto", { exact: true })
      .fill("Sesión con cookie");
    await memberPage
      .getByRole("button", { name: "Guardar movimiento", exact: true })
      .click();
    await expect(
      memberPage.getByRole("link", {
        name: "Editar Sesión con cookie",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      authenticatedRequests.some((request) => request.method === "POST"),
    ).toBe(true);
    expect(
      authenticatedRequests.every(
        (request) =>
          !request.authorization &&
          request.groupReference &&
          request.secretFree,
      ),
    ).toBe(true);
    expect((await creator.read()).members[1]).toMatchObject({
      alias: "Bruno 🧉",
      claimed: true,
    });
    const cookies = await context.cookies();
    expect(
      cookies.every(
        (cookie) => cookie.httpOnly && cookie.sameSite === "Strict",
      ),
    ).toBe(true);
    if (new URL(groups.origin).protocol === "https:") {
      expect(cookies.every((cookie) => cookie.secure)).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test("mobile records an excluded-payer expense, refund and customized contribution in one history", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await page.goto(creatorPath(created));
  await page
    .getByRole("link", { name: "Añadir movimiento", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Gasto", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(
    created.group.today,
  );
  await expect(page.getByLabel("Pagador", { exact: true })).toHaveValue(
    created.group.members[0].id,
  );
  for (const member of created.group.members)
    await expect(
      page.getByRole("checkbox", { name: member.alias, exact: true }),
    ).toBeChecked();

  // Act / When
  await page.getByLabel("Importe total", { exact: true }).fill("10,01");
  await page.getByLabel("Concepto", { exact: true }).fill("Cena compartida");
  await page.getByRole("checkbox", { name: "Ana", exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();

  // Assert / Then
  await expect(
    page.getByRole("link", { name: "Editar Cena compartida", exact: true }),
  ).toBeVisible();
  expect(
    (await created.creator.read()).balances.map((item) => item.amount_cents),
  ).toEqual([1001, -501, -500]);

  await page
    .getByRole("link", { name: "Añadir movimiento", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("radio", { name: "Reembolso", exact: true }).check();
  await page.getByLabel("Importe total", { exact: true }).fill("3.01");
  await page.getByLabel("Concepto", { exact: true }).fill("Devolución reserva");
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Editar Devolución reserva", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Añadir movimiento", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("radio", { name: "Aportación", exact: true }).check();
  await expect(page.getByLabel("Origen", { exact: true })).toHaveValue(
    created.group.members[0].id,
  );
  for (const checkbox of await page.getByRole("checkbox").all())
    await expect(checkbox).not.toBeChecked();
  await page
    .getByLabel("Origen", { exact: true })
    .selectOption(created.group.members[1].id);
  await page.getByLabel("Importe total", { exact: true }).fill("4,01");
  await page.getByRole("checkbox", { name: "Ana", exact: true }).check();
  await page.getByRole("checkbox", { name: "Carla", exact: true }).check();
  await expect(
    page.getByLabel("Importe para Ana", { exact: true }),
  ).toHaveValue("2,01");
  await expect(
    page.getByLabel("Importe para Carla", { exact: true }),
  ).toHaveValue("2,00");
  await page.getByLabel("Importe para Ana", { exact: true }).fill("3,01");
  await page.getByLabel("Importe para Carla", { exact: true }).fill("1,00");
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Editar Aportación", exact: true }),
  ).toBeVisible();
  const state = await created.creator.read();
  expect(state.movements.map((item) => item.type)).toEqual([
    "contribution",
    "refund",
    "expense",
  ]);
  expect(state.total_cents).toBe(700);
  expect(state.balances.map((item) => item.amount_cents)).toEqual([
    500, 0, -500,
  ]);
  await page.getByRole("link", { name: "Liquidación", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "Pagos de liquidación" })
      .getByText("Carla paga 5,00 € a Ana", { exact: true }),
  ).toBeVisible();
});

test("mobile converts an expense to refund, confirms deletion and refreshes another device's changes", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { concept: "Reserva", amount: "9" }),
  );
  await page.goto(creatorPath(created));

  // Act / When
  await page.getByRole("link", { name: "Editar Reserva", exact: true }).click();
  await page.getByRole("radio", { name: "Reembolso", exact: true }).check();
  await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
    "Reserva",
  );
  await expect(page.getByLabel("Importe total", { exact: true })).toHaveValue(
    "9,00",
  );
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();

  // Assert / Then
  await expect(
    page.getByText("Reembolsos netos", { exact: true }),
  ).toBeVisible();
  expect((await created.creator.read()).total_cents).toBe(-900);
  await page.getByRole("link", { name: "Editar Reserva", exact: true }).click();
  await page
    .getByRole("button", { name: "Eliminar movimiento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect((await created.creator.read()).movements).toHaveLength(1);
  await page
    .getByRole("button", { name: "Eliminar movimiento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Eliminar/, exact: false })
    .click();
  // Deletion returns to history after refreshing the browser's group state.
  // The edit page never contained a history link, so its absence is not enough.
  await expect.poll(() => new URL(page.url()).pathname).toBe("/g");
  await expect(
    page.getByRole("link", { name: "Editar Reserva", exact: true }),
  ).toHaveCount(0);
  expect((await created.creator.read()).total_cents).toBe(0);
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { concept: "Desde otro móvil" }),
  );
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Editar Desde otro móvil", exact: true }),
  ).toBeVisible();
});

test("mobile settlement copies and shares only payment lines and closing retains its final summary", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create({ members: ["Ana", "Bruno"] });
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { amount: "60" }),
  );
  await captureNativeActions(page);
  await page.goto(creatorPath(created, "/settlement"));
  const expectedText = "Bruno paga 30,00 € a Ana";

  // Act / When
  await page.getByRole("button", { name: "Copiar texto", exact: true }).click();
  await page.getByRole("button", { name: "Compartir", exact: true }).click();

  // Assert / Then
  expect(await page.evaluate(() => window.acceptanceNative.copies)).toEqual([
    expectedText,
  ]);
  expect(await page.evaluate(() => window.acceptanceNative.shares)).toEqual([
    expectedText,
  ]);
  await page.getByRole("button", { name: "Cerrar grupo", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    /irreversible|recuperar/i,
  );
  await page
    .getByRole("button", { name: "Cerrar y eliminar", exact: true })
    .click();
  await expect(page.getByText(/grupo cerrado/i).first()).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Pagos de liquidación" })
      .getByText(expectedText, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Ana", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Bruno", { exact: true }),
  ).toBeVisible();
  await rejected(await created.creator.response("GET"), 404);
  expect(
    await page.evaluate(() =>
      JSON.stringify(localStorage).includes("Bruno paga"),
    ),
  ).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /grupo no disponible/i }),
  ).toBeVisible();
});

test("mobile settled groups hide settlement copying and sharing", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();

  // Act / When
  await page.goto(creatorPath(created, "/settlement"));

  // Assert / Then
  await expect(
    page.getByText("Todo está saldado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copiar texto", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Compartir", exact: true }),
  ).toHaveCount(0);
});

test("mobile member options change alias and identity while creator options manage the group", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await page.goto(`/g${new URL(created.memberUrl, groups.origin).hash}`);
  await page.getByRole("radio", { name: /Bruno/ }).check();
  await page
    .getByRole("button", { name: "Confirmar identidad", exact: true })
    .click();
  await page.getByRole("link", { name: "Opciones", exact: true }).click();

  // Act / When
  await page.getByLabel("Tu alias", { exact: true }).fill("Brunito");
  await page
    .getByRole("button", { name: "Guardar alias", exact: true })
    .click();

  // Assert / Then
  await expect
    .poll(async () => (await created.creator.read()).members[1].alias)
    .toBe("Brunito");
  await expect(
    page.getByLabel("Nombre del grupo", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cerrar grupo", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Cambiar identidad", { exact: true })
    .selectOption(created.group.members[2].id);
  await page
    .getByRole("button", { name: "Cambiar identidad", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await created.creator.read()).members.map((member) => member.claimed),
    )
    .toEqual([true, false, true]);
  await page.goto(creatorPath(created, "/options"));
  await page
    .getByLabel("Nombre del grupo", { exact: true })
    .fill("Viaje actualizado");
  await page
    .getByRole("button", { name: "Guardar grupo", exact: true })
    .click();
  await expect
    .poll(async () => (await created.creator.read()).name)
    .toBe("Viaje actualizado");
  await page.getByLabel("Nuevo integrante", { exact: true }).fill("David");
  await page
    .getByRole("button", { name: "Añadir integrante", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Eliminar David", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Eliminar David", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Eliminar/, exact: false })
    .click();
  await expect
    .poll(async () => (await created.creator.read()).members)
    .toHaveLength(3);
});

test("mobile explicitly includes a later member when editing an old expense", async ({
  page,
  groups,
}) => {
  // Arrange / Given: the original expense predates both today and the new member.
  const created = await groups.create({ members: ["Ana", "Bruno"] });
  const original: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      date: calendarDate(-1),
      amount: "9.01",
      concept: "Reserva antigua",
    }),
  );
  await created.creator.write("POST", "/members", { alias: "Carla" });
  const joined = await created.creator.read();
  const carla = joined.members[2];
  expect(joined.balances[2].amount_cents).toBe(0);
  expect(
    joined.movements[0].allocations.some(
      (allocation) => allocation.member_id === carla.id,
    ),
  ).toBe(false);
  await page.goto(creatorPath(created));
  await page
    .getByRole("link", { name: "Editar Reserva antigua", exact: true })
    .click();

  // Act / When: adding a member alone did not select them; this edit does.
  const participant = page.getByRole("checkbox", { name: /Carla/ });
  await expect(participant).not.toBeChecked();
  await participant.check();
  await page.getByLabel("Pagador", { exact: true }).selectOption(carla.id);
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();

  // Assert / Then
  await expect.poll(() => new URL(page.url()).pathname).toBe("/g");
  await expect(
    page.getByRole("link", { name: "Editar Reserva antigua", exact: true }),
  ).toBeVisible();
  const updated = await created.creator.read();
  expect(updated.movements[0].version).toBe(original.version + 1);
  expect(Date.parse(updated.movements[0].created_at)).toBe(
    Date.parse(original.created_at),
  );
  expect(updated.movements[0].date).toBe(original.date);
  expect(updated.movements[0].payer_id).toBe(carla.id);
  expect(
    updated.movements[0].allocations.map(
      (allocation) => allocation.amount_cents,
    ),
  ).toEqual([301, 300, 300]);
  expect(updated.balances.map((balance) => balance.amount_cents)).toEqual([
    -301, -300, 601,
  ]);
  expect(updated.total_cents).toBe(901);
});

for (const browserName of ["chromium", "webkit"] as const) {
  test(`${browserName} movement controls keep labels whole and dates contained at 320/390 pixels and 200 percent text`, async ({
    playwright,
    groups,
  }) => {
    // Arrange / Given: only this focused layout scenario launches WebKit.
    const browser = await playwright[browserName].launch();
    try {
      const context = await browser.newContext({
        ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"],
        baseURL: groups.origin,
        locale: "es-ES",
        timezoneId: "UTC",
      });
      const page = await context.newPage();
      const created = await groups.create();
      for (const width of [320, 390]) {
        await test.step(`${width} px`, async () => {
          await page.setViewportSize({ width, height: 844 });
          await page.goto(creatorPath(created, "/movements/new"));
          await expect(
            page.getByRole("heading", {
              name: "Añadir movimiento",
              exact: true,
            }),
          ).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          for (const name of ["Gasto", "Reembolso", "Aportación"]) {
            // Act / When
            await page.getByRole("radio", { name, exact: true }).check();

            // Assert / Then: inspect actual text line boxes, not just page width.
            await movementControlsFit(page);
            await withEnlargedText(page, () => movementControlsFit(page));
          }
        });
      }
    } finally {
      await browser.close();
    }
  });
}

test("all primary screens remain accessible at 320 pixels and 200 percent text without third-party requests", async ({
  page,
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create({
    name: "G".repeat(20),
    members: ["A".repeat(20), "B".repeat(20), "C".repeat(20)],
  });
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      amount: "9999999999.99",
      concept: "R".repeat(50),
    }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  const externalOrigins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== groups.origin)
      externalOrigins.add(url.origin);
  });
  const screens = [
    "/",
    creatorPath(created),
    creatorPath(created, "/movements/new"),
    creatorPath(created, "/options"),
    creatorPath(created, "/settlement"),
    `/g${new URL(created.memberUrl, groups.origin).hash}`,
  ];

  for (const screen of screens) {
    await test.step(`Accessible screen ${new URL(screen, groups.origin).pathname}`, async () => {
      // Act / When
      await page.goto(screen);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Assert / Then
      await accessible(page);
      await test.step("200 percent text enlargement", async () => {
        await withEnlargedText(page, async () => {
          await noHorizontalOverflow(page);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        });
      });
    });
  }
  expect([...externalOrigins]).toEqual([]);
});

test("keyboard navigation and 200 percent text enlargement preserve the mobile creation form", async ({
  page,
}) => {
  // Arrange / Given
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  // Act / When
  await page.keyboard.press("Tab");

  // Assert / Then
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  expect(
    await focused.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth) >= 2
      );
    }),
  ).toBe(true);
  await page.getByLabel("Nombre del grupo", { exact: true }).focus();
  await page.keyboard.type("Plan con teclado");
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Fecha de inicio", { exact: true }),
  ).toBeFocused();

  await touchTargets(page);

  await withEnlargedText(page, async () => {
    await noHorizontalOverflow(page);
    const submit = page.getByRole("button", {
      name: "Crear grupo",
      exact: true,
    });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
    await submit.focus();
    await expect(submit).toBeFocused();
  });
});

test("invalid links render the generic unavailable screen", async ({
  page,
}) => {
  // Arrange / Given
  const invalid = "a".repeat(64);

  // Act / When
  await page.goto(`/g#${invalid}`);

  // Assert / Then
  await expect(
    page.getByRole("heading", { name: /grupo no disponible/i }),
  ).toBeVisible();
});
