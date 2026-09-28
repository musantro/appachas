import { describe, expect, it } from "vitest";
import type { Group } from "../../src/lib/api";
import { groupSummary } from "../../src/lib/group-summary";
import { migrationGroup } from "../fixtures/migration";

function fixture(): Group {
  return {
    ...migrationGroup(),
    members: ["Ana", "Bruno", "Carla"].map((alias, position) => ({
      id: alias,
      alias,
      position,
      version: 1,
      claimed: true,
      is_creator: position === 0,
    })),
  };
}

describe("complete group summary", () => {
  it("retains empty groups and excludes session metadata and server share text", () => {
    const group = {
      ...fixture(),
      settlement_text: "SECRET_LINK",
      id: "SECRET_ID",
    };
    const text = groupSummary(group);
    expect(text).toContain("Escapada");
    expect(text).toContain("2026-09-10 — 2026-09-17 (Europe/Madrid)");
    expect(text).toContain("- Ana\n- Bruno\n- Carla");
    expect(text).toContain("Movimientos (0)\nTodavía no hay movimientos.");
    expect(text).toContain("No hay pagos pendientes.");
    expect(text).not.toContain("SECRET");
  });

  it("preserves refunds, exact cents, multiple recipients and outstanding debts", () => {
    const group = fixture();
    group.total_cents = -1;
    group.movements = ["expense", "refund", "contribution"].map(
      (type, index) => ({
        id: String(index),
        type: type as "expense" | "refund" | "contribution",
        amount_cents: index === 1 ? 302 : 301,
        concept: index === 2 ? "" : "Reserva",
        payer_id: "Ana",
        date: "2026-09-10",
        created_at: "2026-09-10T10:00:00Z",
        updated_at: "2026-09-10T10:00:00Z",
        version: 1,
        allocations: [
          { member_id: "Bruno", amount_cents: 151 },
          { member_id: "Carla", amount_cents: index === 1 ? 151 : 150 },
        ],
      }),
    );
    group.balances = [
      { member_id: "Ana", alias: "Ana", amount_cents: 300 },
      { member_id: "Bruno", alias: "Bruno", amount_cents: -150 },
      { member_id: "Carla", alias: "Carla", amount_cents: -150 },
    ];
    group.payments = [
      { from_member_id: "Bruno", to_member_id: "Ana", amount_cents: 150 },
    ];
    const text = groupSummary(group).replaceAll("\u00a0", " ");
    expect(text).toContain("Gasto total neto: -0,01 €");
    expect(text).toContain("Gasto · 3,01 €");
    expect(text).toContain("Reembolso · 3,02 €");
    expect(text).toContain("Recibido por: Ana");
    expect(text).toContain("Aportación · 3,01 €");
    expect(text).toContain("Destinatarios: Bruno: 1,51 €; Carla: 1,50 €");
    expect(text).toContain("Ana: recibe 3,00 €");
    expect(text).toContain("Bruno: debe 1,50 €");
    expect(text).toContain("Bruno paga 1,50 € a Ana");
    expect(text).toContain("cerrar el grupo no salda las deudas");
  });
});
