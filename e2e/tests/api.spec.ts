import {
  calendarDate,
  expect,
  expenseInput,
  type Group,
  GroupClient,
  groupInput,
  json,
  type Movement,
  rejected,
  test,
} from "../support";

test("initial links exchange for opaque cookies and cannot authorize later operations by themselves", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const anonymous = await groups.member(created);
  const creatorToken = new URL(created.creatorUrl, groups.origin).hash.slice(1);
  await rejected(
    await anonymous.request.get("/api/group", {
      headers: {
        Authorization: `Bearer ${creatorToken}`,
        "X-Appachas-Group": created.group.id,
      },
    }),
    403,
    "identity_required",
  );
  await rejected(
    await anonymous.request.get("/api/group", {
      headers: { Authorization: `Bearer ${creatorToken}` },
    }),
    404,
  );
  await rejected(
    await anonymous.request.post("/api/group/claims", {
      headers: {
        "X-Appachas-Group": created.group.id,
        Origin: groups.origin,
      },
      data: { member_id: created.group.members[1].id },
    }),
    403,
    "identity_required",
  );

  // Act / When
  const response = await anonymous.request.post("/api/group/session", {
    headers: {
      Authorization: `Bearer ${creatorToken}`,
      "X-Appachas-Group": created.group.id,
      Origin: groups.origin,
    },
  });
  const exchange = await json(response);

  // Assert / Then
  const cookies = (await anonymous.request.storageState()).cookies;
  expect(cookies.length).toBe(1);
  expect(cookies[0].name).toBe(`appachas_${created.group.id}`);
  expect(cookies[0].httpOnly && cookies[0].sameSite === "Strict").toBe(true);
  if (new URL(groups.origin).protocol === "https:")
    expect(cookies[0].secure).toBe(true);
  const body = JSON.stringify(exchange);
  expect(
    [creatorToken, created.memberToken, cookies[0].value].every(
      (secret) => !body.includes(secret),
    ),
  ).toBe(true);
  expect(exchange.group.role).toBe("creator");
  const headers = {
    "X-Appachas-Group": created.group.id,
    Origin: groups.origin,
  };
  const state = await json(
    await anonymous.request.get("/api/group", { headers }),
  );
  expect(state.my_member_id).toBe(created.group.creator_member_id);
  await json(
    await anonymous.request.post("/api/group/movements", {
      headers,
      data: expenseInput(created.group),
    }),
  );
  expect((await created.creator.read()).movements).toHaveLength(1);
});

test("one device keeps independent identity cookies for multiple groups", async ({
  groups,
}) => {
  // Arrange / Given
  const first = await groups.create();
  const second = await groups.create({ name: "Second group" });
  const firstClient = await groups.member(first);
  const secondClient = new GroupClient(
    firstClient.request,
    second.group.id,
    groups.origin,
    second.memberToken,
  );
  await firstClient.write("POST", "/claims", {
    member_id: first.group.members[1].id,
  });

  // Act / When
  await secondClient.write("POST", "/claims", {
    member_id: second.group.members[2].id,
  });

  // Assert / Then
  expect((await firstClient.read()).my_member_id).toBe(
    first.group.members[1].id,
  );
  expect((await secondClient.read()).my_member_id).toBe(
    second.group.members[2].id,
  );
  expect((await firstClient.request.storageState()).cookies.length).toBe(2);
  const firstState = await first.creator.read();
  await first.creator.write("DELETE", `?version=${firstState.version}`);
  expect((await secondClient.read()).my_member_id).toBe(
    second.group.members[2].id,
  );
});

test("a one-cent contribution to two recipients retains the zero-cent remainder", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const [ana, bruno, carla] = created.group.members;

  // Act / When
  const movement: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      type: "contribution",
      amount: "0.01",
      concept: "",
      payer_id: ana.id,
      participant_ids: [bruno.id, carla.id],
      allocations: [
        { member_id: bruno.id, amount: "0.01" },
        { member_id: carla.id, amount: "0.00" },
      ],
    }),
  );

  // Assert / Then
  expect(movement.allocations.map((item) => item.amount_cents)).toEqual([1, 0]);
  expect((await created.creator.read()).total_cents).toBe(0);
});

for (const type of ["expense", "refund", "contribution"] as const) {
  test(`a later member starts without history and can explicitly join an old ${type} as participant and payer`, async ({
    groups,
  }) => {
    // Arrange / Given
    const created = await groups.create({ members: ["Ana", "Bruno"] });
    const [ana, bruno] = created.group.members;
    const input = expenseInput(created.group, {
      type,
      amount: "12.00",
      date: calendarDate(-1),
      participant_ids:
        type === "contribution" ? [bruno.id] : [ana.id, bruno.id],
      ...(type === "contribution"
        ? { allocations: [{ member_id: bruno.id, amount: "12.00" }] }
        : {}),
    });
    const original: Movement = await created.creator.write(
      "POST",
      "/movements",
      input,
    );
    const before = await created.creator.read();
    await created.creator.write("POST", "/members", { alias: "David" });
    const added = await created.creator.read();
    const david = added.members[2];

    // Adding someone alone must never rewrite history or introduce a balance.
    expect(added.movements).toEqual(before.movements);
    expect(added.total_cents).toBe(before.total_cents);
    expect(added.balances.map((balance) => balance.amount_cents)).toEqual([
      ...before.balances.map((balance) => balance.amount_cents),
      0,
    ]);

    // Act / When: an explicit edit adds the new member to the old split.
    const edited: Movement = await created.creator.write(
      "PUT",
      `/movements/${original.id}`,
      {
        ...input,
        version: original.version,
        participant_ids:
          type === "contribution"
            ? [bruno.id, david.id]
            : [ana.id, bruno.id, david.id],
        ...(type === "contribution"
          ? {
              allocations: [
                { member_id: bruno.id, amount: "6.00" },
                { member_id: david.id, amount: "6.00" },
              ],
            }
          : {}),
      },
    );

    // Assert / Then
    expect(edited.version).toBe(original.version + 1);
    expect(Date.parse(edited.created_at)).toBe(Date.parse(original.created_at));
    expect(edited.date).toBe(original.date);
    expect(
      edited.allocations.map((allocation) => allocation.amount_cents),
    ).toEqual(
      type === "contribution"
        ? [600, 600]
        : type === "refund"
          ? [-400, -400, -400]
          : [400, 400, 400],
    );
    const participating = await created.creator.read();
    expect(participating.version).toBeGreaterThan(added.version);
    expect(
      participating.balances.map((balance) => balance.amount_cents),
    ).toEqual(
      type === "contribution"
        ? [1200, -600, -600]
        : type === "refund"
          ? [-800, 400, 400]
          : [800, -400, -400],
    );

    // The new member can also be the payer/source of that same old movement.
    const payerInput = {
      ...input,
      version: edited.version,
      payer_id: david.id,
      participant_ids: [ana.id, bruno.id],
      ...(type === "contribution"
        ? {
            allocations: [
              { member_id: ana.id, amount: "5.00" },
              { member_id: bruno.id, amount: "7.00" },
            ],
          }
        : {}),
    };
    const repaid: Movement = await created.creator.write(
      "PUT",
      `/movements/${original.id}`,
      payerInput,
    );
    expect(repaid.payer_id).toBe(david.id);
    expect(repaid.version).toBe(edited.version + 1);
    expect(Date.parse(repaid.created_at)).toBe(Date.parse(original.created_at));
    expect(repaid.date).toBe(original.date);
    const final = await created.creator.read();
    expect(final.total_cents).toBe(before.total_cents);
    expect(final.balances.map((balance) => balance.amount_cents)).toEqual(
      type === "contribution"
        ? [-500, -700, 1200]
        : type === "refund"
          ? [600, 600, -1200]
          : [-600, -600, 1200],
    );
    expect(
      final.balances.reduce(
        (total, balance) => total + balance.amount_cents,
        0,
      ),
    ).toBe(0);
    await rejected(
      await created.creator.response(
        "PUT",
        `/movements/${original.id}`,
        payerInput,
      ),
      409,
      "stale_version",
    );
    expect((await created.creator.read()).movements).toEqual(final.movements);
  });
}

test("closing a stale settlement is rejected when another member adds a movement", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const member = await groups.member(created);
  await member.write("POST", "/claims", {
    member_id: created.group.members[1].id,
  });
  const initial = await created.creator.read();
  await member.write("POST", "/movements", expenseInput(initial));

  // Act / When
  const response = await created.creator.response(
    "DELETE",
    `?version=${initial.version}`,
  );

  // Assert / Then
  await rejected(response, 409, "stale_version");
  expect((await created.creator.read()).movements).toHaveLength(1);
});

test("creation stores Unicode names, timezone and two independent access levels", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create({
    name: "  Viaje a Gijón 🚌  ",
    members: ["  Ana  ", "Íñigo 🐈", "Carla"],
    timezone: "Europe/Madrid",
  });
  const member = await groups.member(created);

  // Act / When
  const metadata = await member.metadata();

  // Assert / Then
  expect(created.group.name).toBe("Viaje a Gijón 🚌");
  expect(created.group.timezone).toBe("Europe/Madrid");
  expect(created.group.members.map((item) => item.alias)).toEqual([
    "Ana",
    "Íñigo 🐈",
    "Carla",
  ]);
  expect(created.creatorUrl !== created.memberUrl).toBe(true);
  expect(new URL(created.creatorUrl, groups.origin).hash.length >= 40).toBe(
    true,
  );
  expect(new URL(created.memberUrl, groups.origin).hash.length >= 40).toBe(
    true,
  );
  expect(created.group.role).toBe("creator");
  expect(created.group.my_member_id).toBe(created.group.creator_member_id);
  expect(metadata.members.map((item) => item.claimed)).toEqual([
    true,
    false,
    false,
  ]);
  for (const key of [
    "movements",
    "balances",
    "payments",
    "total_cents",
    "settlement_text",
  ]) {
    expect(Object.hasOwn(metadata, key), `Public metadata omits ${key}`).toBe(
      false,
    );
  }
  await rejected(await member.response("GET"), 403, "identity_required");
});

test("creation rejects invalid names, member bounds, dates and timezone", async ({
  request,
  groups,
}) => {
  // Arrange / Given
  const invalid: Record<string, unknown>[] = [
    { name: "" },
    { name: "   " },
    { name: "x".repeat(21) },
    { members: ["Ana"] },
    { members: Array.from({ length: 51 }, (_, index) => `Member ${index}`) },
    { members: ["Ana", ""] },
    { members: ["Ana", "x".repeat(21)] },
    { members: ["Ana", "  aNA "] },
    { creator_index: 4 },
    { start_date: calendarDate(-1) },
    { end_date: calendarDate() },
    { start_date: calendarDate(8), end_date: calendarDate(7) },
    { timezone: "Not/A_Timezone" },
  ];

  for (const fields of invalid) {
    // Act / When
    const response = await request.post("/api/groups", {
      data: groupInput(fields),
      headers: { Origin: groups.origin },
    });
    if (response.status() === 201) {
      const unexpected = await response.json();
      await groups.register(unexpected.creator_token, unexpected.group.id);
    }
    // Assert / Then
    await rejected(response, 422);
  }
});

test("claims persist an optional alias and reject duplicate aliases without taking the identity", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const client = await groups.member(created);
  const memberId = created.group.members[1].id;
  await rejected(
    await client.response("POST", "/claims", {
      member_id: memberId,
      alias: " aNA ",
    }),
    422,
  );
  expect((await client.metadata()).members[1].claimed).toBe(false);

  // Act / When
  await client.write("POST", "/claims", {
    member_id: memberId,
    alias: "  Bruno 🧉  ",
  });

  // Assert / Then
  const memberView = await client.read();
  expect(memberView.my_member_id).toBe(memberId);
  expect(memberView.role).toBe("member");
  expect((await created.creator.read()).members[1]).toMatchObject({
    id: memberId,
    alias: "Bruno 🧉",
    claimed: true,
  });
  const cookies = (await client.request.storageState()).cookies;
  expect(cookies.length).toBeGreaterThan(0);
  expect(
    cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Strict"),
  ).toBe(true);
  if (new URL(groups.origin).protocol === "https:") {
    expect(cookies.every((cookie) => cookie.secure)).toBe(true);
  }
});

test("simultaneous claims allow exactly one device and reject the other with conflict", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const [first, second] = await Promise.all([
    groups.member(created),
    groups.member(created),
  ]);
  const payload = { member_id: created.group.members[1].id };

  // Act / When
  const responses = await Promise.all([
    first.response("POST", "/claims", payload),
    second.response("POST", "/claims", payload),
  ]);

  // Assert / Then
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const conflict = responses.find((response) => response.status() === 409);
  if (!conflict) throw new Error("One competing claim must conflict");
  await rejected(conflict, 409, "member_already_claimed");
  expect((await conflict.json()).detail).toBe(
    "Este integrante ya está ocupado",
  );
  expect((await created.creator.read()).members[1].claimed).toBe(true);
});

test("identity changes are atomic and creator release revokes the previous session", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const client = await groups.member(created);
  const other = await groups.member(created);
  const [, bruno, carla] = created.group.members;
  await client.write("POST", "/claims", { member_id: bruno.id });
  await other.write("POST", "/claims", { member_id: carla.id });

  // Act / When
  await rejected(
    await client.response("POST", "/claims", { member_id: carla.id }),
    409,
  );

  // Assert / Then
  expect((await client.read()).my_member_id).toBe(bruno.id);
  const occupiedCarla = (await created.creator.read()).members[2];
  await created.creator.write("POST", `/members/${carla.id}/release`, {
    version: occupiedCarla.version,
  });
  await rejected(await other.response("GET"), 403, "identity_required");
  await client.write("POST", "/claims", { member_id: carla.id });
  const state = await created.creator.read();
  expect(state.members[1].claimed).toBe(false);
  expect(state.members[2].claimed).toBe(true);
  expect((await client.read()).my_member_id).toBe(carla.id);
});

test("members manage other members' movements but cannot administer the group", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const member = await groups.member(created);
  await member.write("POST", "/claims", {
    member_id: created.group.members[1].id,
  });
  const movement: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );

  // Act / When
  const edited: Movement = await member.write(
    "PUT",
    `/movements/${movement.id}`,
    expenseInput(created.group, { amount: "12.50", version: movement.version }),
  );

  // Assert / Then
  expect((await created.creator.read()).total_cents).toBe(1250);
  const forbidden: [string, string, unknown?][] = [
    [
      "PUT",
      "",
      {
        name: "Other name",
        start_date: created.group.start_date,
        end_date: created.group.end_date,
        version: (await member.read()).version,
      },
    ],
    ["POST", "/members", { alias: "David" }],
    ["POST", `/members/${created.group.members[2].id}/release`, { version: 1 }],
    ["DELETE", `?version=${(await member.read()).version}`],
  ];
  for (const [method, path, payload] of forbidden)
    await rejected(await member.response(method, path, payload), 403);
  await member.write(
    "DELETE",
    `/movements/${edited.id}?version=${edited.version}`,
  );
  expect((await created.creator.read()).movements).toHaveLength(0);
});

test("member and creator renames preserve stable identities, claims and existing history", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const client = await groups.member(created);
  const original = created.group.members[1];
  await client.write("POST", "/claims", { member_id: original.id });
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );

  // Act / When
  const claimed = (await client.read()).members[1];
  await client.write("PUT", `/members/${original.id}`, {
    alias: "B 🐝",
    version: claimed.version,
  });

  // Assert / Then
  let state = await created.creator.read();
  expect(state.members[1]).toMatchObject({
    id: original.id,
    position: original.position,
    alias: "B 🐝",
    claimed: true,
  });
  expect(
    state.movements[0].allocations.some(
      (item) => item.member_id === original.id,
    ),
  ).toBe(true);
  await rejected(
    await client.response("PUT", `/members/${state.members[2].id}`, {
      alias: "Another",
      version: state.members[2].version,
    }),
    403,
  );
  await created.creator.write("PUT", `/members/${original.id}`, {
    alias: "Bruno renombrado",
    version: state.members[1].version,
  });
  state = await created.creator.read();
  expect(state.members[1]).toMatchObject({
    id: original.id,
    position: original.position,
    alias: "Bruno renombrado",
    claimed: true,
  });
  expect((await client.read()).my_member_id).toBe(original.id);
});

test("member management preserves historical allocations and forbids deleting referenced members or the creator", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );
  const before = await created.creator.read();

  // Act / When
  await created.creator.write("POST", "/members", { alias: "David" });

  // Assert / Then
  let state = await created.creator.read();
  const david = state.members[3];
  expect(
    state.balances.find((balance) => balance.member_id === david.id)
      ?.amount_cents,
  ).toBe(0);
  expect(state.movements[0].allocations).toEqual(
    before.movements[0].allocations,
  );
  await rejected(
    await created.creator.response(
      "DELETE",
      `/members/${state.members[1].id}?version=${state.members[1].version}`,
    ),
    422,
  );
  await rejected(
    await created.creator.response(
      "DELETE",
      `/members/${state.members[0].id}?version=${state.members[0].version}`,
    ),
    403,
  );
  await rejected(
    await created.creator.response(
      "POST",
      `/members/${state.members[0].id}/release`,
      { version: state.members[0].version },
    ),
    403,
  );
  const client = await groups.member(created);
  await client.write("POST", "/claims", { member_id: david.id });
  state = await created.creator.read();
  await created.creator.write(
    "DELETE",
    `/members/${david.id}?version=${state.members[3].version}`,
  );
  expect((await created.creator.read()).members).toHaveLength(3);
  await rejected(await client.response("GET"), 403, "identity_required");
});

test("an excluded payer receives credit and odd cents follow member creation order", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const [ana, bruno, carla] = created.group.members;

  // Act / When
  const movement: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      amount: "10,01",
      participant_ids: [carla.id, bruno.id],
    }),
  );

  // Assert / Then
  const shares = Object.fromEntries(
    movement.allocations.map((allocation) => [
      allocation.member_id,
      allocation.amount_cents,
    ]),
  );
  expect(shares).toEqual({ [bruno.id]: 501, [carla.id]: 500 });
  const state = await created.creator.read();
  expect(state.total_cents).toBe(1001);
  expect(state.balances.map((balance) => balance.amount_cents)).toEqual([
    1001, -501, -500,
  ]);
  expect(
    state.balances.reduce((sum, balance) => sum + balance.amount_cents, 0),
  ).toBe(0);
  expect(state.payments).toEqual([
    { from_member_id: bruno.id, to_member_id: ana.id, amount_cents: 501 },
    { from_member_id: carla.id, to_member_id: ana.id, amount_cents: 500 },
  ]);
  expect(state.settlement_text).toBe(
    "Bruno paga 5,01 € a Ana\nCarla paga 5,00 € a Ana",
  );
});

test("an independent refund produces a negative total and a valid settlement", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();

  // Act / When
  const refund: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      type: "refund",
      amount: "0.05",
      concept: "Returned deposit",
    }),
  );

  // Assert / Then
  expect(refund.amount_cents).toBe(-5);
  expect(refund.allocations.map((item) => item.amount_cents)).toEqual([
    -2, -2, -1,
  ]);
  const state = await created.creator.read();
  expect(state.total_cents).toBe(-5);
  expect(state.balances.map((item) => item.amount_cents)).toEqual([-3, 2, 1]);
  expect(state.settlement_text).toBe(
    "Ana paga 0,02 € a Bruno\nAna paga 0,01 € a Carla",
  );
});

test("expense-refund conversion preserves creation time and rejects conversion to contribution", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const original: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );

  // Act / When
  const refund: Movement = await created.creator.write(
    "PUT",
    `/movements/${original.id}`,
    expenseInput(created.group, { type: "refund", version: original.version }),
  );

  // Assert / Then
  expect(refund).toMatchObject({
    id: original.id,
    date: original.date,
    concept: original.concept,
    payer_id: original.payer_id,
    amount_cents: -original.amount_cents,
    version: original.version + 1,
  });
  expect(Date.parse(refund.created_at)).toBe(Date.parse(original.created_at));
  expect(refund.allocations.map((item) => item.member_id)).toEqual(
    original.allocations.map((item) => item.member_id),
  );
  await rejected(
    await created.creator.response(
      "PUT",
      `/movements/${original.id}`,
      expenseInput(created.group, {
        type: "contribution",
        participant_ids: [created.group.members[1].id],
        version: refund.version,
      }),
    ),
    422,
  );
  expect((await created.creator.read()).total_cents).toBe(-1000);
});

test("contributions accept custom allocations and optional concept without changing the net total", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const [ana, bruno, carla] = created.group.members;
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { amount: "90.00" }),
  );

  // Act / When
  const contribution: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      type: "contribution",
      amount: "30.00",
      concept: "",
      payer_id: bruno.id,
      participant_ids: [ana.id, carla.id],
      allocations: [
        { member_id: ana.id, amount: "20.00" },
        { member_id: carla.id, amount: "10.00" },
      ],
    }),
  );

  // Assert / Then
  expect(contribution.amount_cents).toBe(3000);
  expect(contribution.allocations.map((item) => item.amount_cents)).toEqual([
    2000, 1000,
  ]);
  const state = await created.creator.read();
  expect(state.total_cents).toBe(9000);
  expect(state.balances.map((item) => item.amount_cents)).toEqual([
    4000, 0, -4000,
  ]);
  expect(state.settlement_text).toBe("Carla paga 40,00 € a Ana");
});

test("contributions can settle a debt exactly or reverse it when the amount is excessive", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create({ members: ["Ana", "Bruno"] });
  const [ana, bruno] = created.group.members;
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { amount: "60.00" }),
  );
  const payload = expenseInput(created.group, {
    type: "contribution",
    amount: "30",
    concept: "",
    payer_id: bruno.id,
    participant_ids: [ana.id],
  });

  // Act / When
  const contribution: Movement = await created.creator.write(
    "POST",
    "/movements",
    payload,
  );

  // Assert / Then
  let state = await created.creator.read();
  expect(state.payments).toEqual([]);
  expect(state.balances.map((item) => item.amount_cents)).toEqual([0, 0]);
  await created.creator.write("PUT", `/movements/${contribution.id}`, {
    ...payload,
    amount: "40",
    version: contribution.version,
  });
  state = await created.creator.read();
  expect(state.total_cents).toBe(6000);
  expect(state.settlement_text).toBe("Ana paga 10,00 € a Bruno");
});

test("movement validation rejects invalid amounts, concepts, dates, participants and contributions", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const [ana, bruno] = created.group.members;
  const invalid = [
    { amount: "0" },
    { amount: "-1" },
    { amount: "0.001" },
    { amount: "NaN" },
    { amount: "9999999999999999999999999999" },
    { concept: "" },
    { concept: "x".repeat(51) },
    { date: calendarDate(1) },
    { date: calendarDate(8) },
    { participant_ids: [] },
    { participant_ids: [ana.id, ana.id] },
    { payer_id: "00000000-0000-0000-0000-000000000000" },
    { type: "contribution", concept: "", participant_ids: [] },
    { type: "contribution", participant_ids: [ana.id] },
    {
      type: "contribution",
      participant_ids: [bruno.id],
      allocations: [{ member_id: bruno.id, amount: "9.99" }],
    },
  ];
  for (const fields of invalid) {
    // Act / When
    const response = await created.creator.response(
      "POST",
      "/movements",
      expenseInput(created.group, fields),
    );
    // Assert / Then
    await rejected(response, 422);
  }
  expect((await created.creator.read()).movements).toEqual([]);
});

test("history accepts advance payments and sorts by date then immutable creation time", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const older: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      date: calendarDate(-90),
      concept: "Advance booking",
    }),
  );
  const first: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { concept: "First today" }),
  );
  const last: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, { type: "refund", concept: "Second today" }),
  );

  // Act / When
  const edited: Movement = await created.creator.write(
    "PUT",
    `/movements/${first.id}`,
    expenseInput(created.group, {
      concept: "Edited first",
      version: first.version,
    }),
  );

  // Assert / Then
  expect(Date.parse(edited.created_at)).toBe(Date.parse(first.created_at));
  expect(
    (await created.creator.read()).movements.map((item) => item.id),
  ).toEqual([last.id, first.id, older.id]);
});

test("concurrent movement edits reject the stale version and retain the successful update", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const original: Movement = await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );
  const inputs = ["New concept one", "New concept two"].map((concept) =>
    expenseInput(created.group, { concept, version: original.version }),
  );

  // Act / When
  const responses = await Promise.all(
    inputs.map((input) =>
      created.creator.response("PUT", `/movements/${original.id}`, input),
    ),
  );

  // Assert / Then
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const successfulIndex = responses.findIndex(
    (response) => response.status() === 200,
  );
  const state = await created.creator.read();
  expect(state.movements[0].concept).toBe(inputs[successfulIndex].concept);
  expect(state.movements[0].version).toBe(original.version + 1);
  expect(Date.parse(state.movements[0].created_at)).toBe(
    Date.parse(original.created_at),
  );
  await rejected(
    await created.creator.response(
      "DELETE",
      `/movements/${original.id}?version=${original.version}`,
    ),
    409,
    "stale_version",
  );
});

test("greedy settlement orders descending amounts with original member-order ties", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create({
    members: ["Ana", "Bruno", "Carla", "David"],
  });
  const [ana, bruno, carla, david] = created.group.members;
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      amount: "40",
      payer_id: ana.id,
      participant_ids: [carla.id, david.id],
    }),
  );
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group, {
      amount: "40",
      payer_id: bruno.id,
      participant_ids: [carla.id, david.id],
    }),
  );

  // Act / When
  const settlement = await json(
    await created.creator.response("GET", "/settlement"),
  );

  // Assert / Then
  expect(settlement.payments).toEqual([
    { from_member_id: carla.id, to_member_id: ana.id, amount_cents: 4000 },
    { from_member_id: david.id, to_member_id: bruno.id, amount_cents: 4000 },
  ]);
  expect(settlement.text).toBe(
    "Carla paga 40,00 € a Ana\nDavid paga 40,00 € a Bruno",
  );
});

test("creator configuration uses versions and refuses to exclude an existing movement", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );
  const initial = await created.creator.read();

  // Act / When
  await created.creator.write("PUT", "", {
    name: "Nuevo nombre",
    start_date: initial.start_date,
    end_date: calendarDate(9),
    version: initial.version,
  });

  // Assert / Then
  const state = await created.creator.read();
  expect(state.name).toBe("Nuevo nombre");
  expect(state.end_date).toBe(calendarDate(9));
  await rejected(
    await created.creator.response("PUT", "", {
      name: "Old write",
      start_date: initial.start_date,
      end_date: initial.end_date,
      version: initial.version,
    }),
    409,
    "stale_version",
  );
  await rejected(
    await created.creator.response("PUT", "", {
      name: state.name,
      start_date: calendarDate(1),
      end_date: state.end_date,
      version: state.version,
    }),
    422,
  );
});

test("closing deletes the group and makes both links and subsequent writes unavailable", async ({
  groups,
}) => {
  // Arrange / Given
  const created = await groups.create();
  const member = await groups.member(created);
  await member.write("POST", "/claims", {
    member_id: created.group.members[1].id,
  });
  await created.creator.write(
    "POST",
    "/movements",
    expenseInput(created.group),
  );
  const state: Group = await created.creator.read();

  // Act / When
  await created.creator.write("DELETE", `?version=${state.version}`);

  // Assert / Then
  await rejected(await created.creator.response("GET"), 404);
  await rejected(await member.response("GET", "/metadata"), 404);
  await rejected(await member.response("GET"), 404);
  await rejected(
    await created.creator.response("POST", "/movements", expenseInput(state)),
    404,
  );
});
