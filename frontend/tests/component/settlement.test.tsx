import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGroup } from "../../src/features/groups/GroupContext";
import { SettlementPage } from "../../src/features/groups/SettlementPage";
import { api, type Group, type Movement } from "../../src/lib/api";

vi.mock("../../src/features/groups/GroupContext", () => ({
  groupKey: (groupId: string) => ["group", groupId],
  useGroup: vi.fn(),
}));

const group = {
  id: "group-1",
  name: "Viaje",
  start_date: "2026-09-10",
  end_date: "2026-09-15",
  timezone: "Europe/Madrid",
  today: "2026-09-16",
  version: 1,
  creator_member_id: "ana",
  members: [
    {
      id: "ana",
      alias: "Ana",
      position: 0,
      claimed: true,
      is_creator: true,
      version: 1,
    },
    {
      id: "bruno",
      alias: "Bruno",
      position: 1,
      claimed: true,
      is_creator: false,
      version: 1,
    },
    {
      id: "carla",
      alias: "Carla",
      position: 2,
      claimed: true,
      is_creator: false,
      version: 1,
    },
  ],
  role: "creator",
  my_member_id: "ana",
  movements: [{}],
  balances: [
    { member_id: "ana", alias: "Ana", amount_cents: 1000 },
    { member_id: "bruno", alias: "Bruno", amount_cents: 0 },
    { member_id: "carla", alias: "Carla", amount_cents: -1000 },
  ],
  payments: [
    { from_member_id: "carla", to_member_id: "ana", amount_cents: 1000 },
  ],
  settlement_text: "Carla paga 10,00 € a Ana",
  total_cents: 3000,
} as Group;

function renderSettlement() {
  vi.mocked(useGroup).mockReturnValue({ groupId: group.id, group });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SettlementPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("settlement page", () => {
  afterEach(() => vi.restoreAllMocks());

  it("derives member status from balances and records a payment as a contribution", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(api, "createMovement").mockResolvedValue({
      id: "contribution-1",
      type: "contribution",
    } as Movement);
    renderSettlement();

    expect(screen.getAllByText("Pendiente")).toHaveLength(2);
    expect(screen.getByText("Liquidado")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Registrar pago de Carla a Ana" }),
    );

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("group-1", {
        type: "contribution",
        amount: "10,00",
        concept: "",
        date: "2026-09-15",
        payer_id: "carla",
        participant_ids: [],
        allocations: [{ member_id: "ana", amount: "10,00" }],
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Pago registrado como aportación.",
    );
  });
});
