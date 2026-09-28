import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useGroup } from "../../src/features/groups/GroupContext";
import { GroupPage } from "../../src/features/groups/GroupPage";
import type { Group, Movement } from "../../src/lib/api";

vi.mock("../../src/features/groups/GroupContext", () => ({
  useGroup: vi.fn(),
  groupKey: (id: string) => ["group", id],
}));

function show(amount: number, movements: Movement[] = []) {
  const group: Group = {
    id: "test-group",
    name: "Lisboa",
    start_date: "2026-09-16",
    end_date: "2026-09-17",
    today: "2026-09-16",
    timezone: "Europe/Madrid",
    version: 1,
    creator_member_id: "Ana",
    my_member_id: "Ana",
    role: "creator",
    members: ["Ana", "Bruno", "Carla"].map((alias, position) => ({
      id: alias,
      alias,
      position,
      claimed: true,
      is_creator: position === 0,
      version: 1,
    })),
    movements,
    balances: [{ member_id: "Ana", alias: "Ana", amount_cents: amount }],
    payments: [],
    settlement_text: "",
    total_cents: 3000,
  };
  vi.mocked(useGroup).mockReturnValue({ group, groupId: group.id });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <GroupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function movement(type: Movement["type"]): Movement {
  return {
    id: type,
    type,
    concept: type === "contribution" ? "" : "Taxi",
    payer_id: "Carla",
    amount_cents: 3000,
    date: "2026-09-16",
    created_at: "2026-09-16T10:00:00Z",
    updated_at: "2026-09-16T10:00:00Z",
    version: 1,
    allocations: [
      { member_id: "Ana", amount_cents: 2000 },
      { member_id: "Bruno", amount_cents: 1000 },
    ],
  };
}

describe("group summary", () => {
  it.each([
    [9100, /Te deben 91,00\s€/],
    [-2400, /Debes 24,00\s€/],
    [0, /Tu cuenta está saldada/],
  ])("shows personal balance %s with access to settlement", (amount, label) => {
    show(amount, [movement("expense")]);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      "/g/settlement?group=test-group",
    );
  });

  it("does not describe an unused group as settled", () => {
    show(0);
    expect(
      screen.getByRole("link", { name: "Tu saldo: 0,00 €" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Tu cuenta está saldada"),
    ).not.toBeInTheDocument();
  });

  it("explains payer, split, refund and all contribution recipients", () => {
    show(9100, [
      movement("expense"),
      movement("refund"),
      movement("contribution"),
    ]);
    expect(screen.getByText("Pagó Carla · Entre 2 personas")).toBeVisible();
    expect(
      screen.getByText("Carla recibió la devolución · Entre 2 personas"),
    ).toBeVisible();
    expect(screen.getByText("Carla envió a Ana y Bruno")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Editar Aportación",
      }),
    ).toHaveAccessibleDescription("Carla envió a Ana y Bruno");
  });
});
