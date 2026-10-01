import { describe, expect, it } from "vitest";
import type { Group, Movement } from "../../src/lib/api";
import {
  groupMovementsCsv,
  groupMovementsFilename,
} from "../../src/lib/group-movements-csv";
import { migrationGroup } from "../fixtures/migration";

function fixture(): Group {
  return {
    ...migrationGroup(),
    name: "Viaje a Málaga",
    today: "2026-10-01",
    members: ["Ana", "Bruno", "Carla", "Diego"].map((alias, position) => ({
      id: alias.toLowerCase(),
      alias,
      position,
      version: 1,
      claimed: true,
      is_creator: position === 0,
    })),
  };
}

function movement(
  overrides: Partial<Movement> & Pick<Movement, "id" | "amount_cents">,
): Movement {
  return {
    type: "expense",
    concept: "Cena",
    payer_id: "ana",
    date: "2026-09-10",
    created_at: "2026-09-10T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    version: 1,
    allocations: [],
    ...overrides,
  };
}

function lines(group: Group): string[] {
  return groupMovementsCsv(group).slice(1).trimEnd().split("\r\n");
}

describe("group movements CSV", () => {
  it("exports equal and unequal splits as one deterministic row per recipient", () => {
    const group = fixture();
    group.movements = [
      movement({
        id: "later",
        amount_cents: 1000,
        date: "2026-09-11",
        created_at: "2026-09-11T10:00:00Z",
        allocations: [
          { member_id: "carla", amount_cents: 333 },
          { member_id: "ana", amount_cents: 334 },
          { member_id: "bruno", amount_cents: 333 },
        ],
      }),
      movement({
        id: "earlier",
        amount_cents: 900,
        allocations: [
          { member_id: "carla", amount_cents: 300 },
          { member_id: "bruno", amount_cents: 300 },
          { member_id: "ana", amount_cents: 300 },
        ],
      }),
    ];

    expect(lines(group)).toEqual([
      "id_movimiento;fecha;tipo;concepto;pagador;destinatario;importe_asignado;moneda",
      '"earlier";"2026-09-10";"gasto";"Cena";"Ana";"Ana";3,00;"EUR"',
      '"earlier";"2026-09-10";"gasto";"Cena";"Ana";"Bruno";3,00;"EUR"',
      '"earlier";"2026-09-10";"gasto";"Cena";"Ana";"Carla";3,00;"EUR"',
      '"later";"2026-09-11";"gasto";"Cena";"Ana";"Ana";3,34;"EUR"',
      '"later";"2026-09-11";"gasto";"Cena";"Ana";"Bruno";3,33;"EUR"',
      '"later";"2026-09-11";"gasto";"Cena";"Ana";"Carla";3,33;"EUR"',
    ]);
    expect(groupMovementsCsv(group)).not.toContain("Diego");
  });

  it("exports refunds as negative expenses and contributions as liquidations", () => {
    const group = fixture();
    group.payments = [];
    group.movements = [
      movement({
        id: "refund",
        type: "refund",
        amount_cents: -250,
        concept: "Devolución",
        allocations: [{ member_id: "bruno", amount_cents: -250 }],
      }),
      movement({
        id: "settlement",
        type: "contribution",
        amount_cents: 725,
        concept: "Liquidación final",
        payer_id: "bruno",
        allocations: [
          { member_id: "ana", amount_cents: 700 },
          { member_id: "carla", amount_cents: 25 },
        ],
      }),
    ];

    const csv = groupMovementsCsv(group);
    expect(csv).toContain(
      '"refund";"2026-09-10";"gasto";"Devolución";"Ana";"Bruno";-2,50;"EUR"',
    );
    expect(csv).toContain(
      '"settlement";"2026-09-10";"liquidacion";"Liquidación final";"Bruno";"Ana";7,00;"EUR"',
    );
    expect(csv).toContain(
      '"settlement";"2026-09-10";"liquidacion";"Liquidación final";"Bruno";"Carla";0,25;"EUR"',
    );
  });

  it("keeps settled groups exportable and emits an Excel-compatible BOM", () => {
    const group = fixture();
    group.balances = group.members.map((member) => ({
      member_id: member.id,
      alias: member.alias,
      amount_cents: 0,
    }));
    group.payments = [];
    group.movements = [
      movement({
        id: "settled",
        amount_cents: 100,
        allocations: [{ member_id: "ana", amount_cents: 100 }],
      }),
    ];

    const csv = groupMovementsCsv(group);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"settled"');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(groupMovementsFilename(group)).toBe(
      "appachas-viaje-a-malaga-movimientos-2026-10-01.csv",
    );
  });

  it("escapes delimiters and spreadsheet formulas in user-controlled text", () => {
    const group = fixture();
    group.members[0].alias = " =2+2";
    group.movements = [
      movement({
        id: "safe",
        amount_cents: 100,
        concept: 'Cena; "especial"',
        allocations: [{ member_id: "ana", amount_cents: 100 }],
      }),
    ];

    const csv = groupMovementsCsv(group);
    expect(csv).toContain('"Cena; ""especial"""');
    expect(csv).toContain('"\' =2+2"');
  });

  it("refuses to export a movement whose allocations do not match its total", () => {
    const group = fixture();
    group.movements = [
      movement({
        id: "invalid",
        amount_cents: 100,
        allocations: [{ member_id: "ana", amount_cents: 99 }],
      }),
    ];

    expect(() => groupMovementsCsv(group)).toThrow(
      "Movement allocations do not match its total",
    );
  });
});
