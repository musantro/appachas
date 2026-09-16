import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GroupBoundary } from "../../src/features/groups/GroupContext";
import { MovementPage } from "../../src/features/groups/MovementPage";
import { api, type Group, type Movement } from "../../src/lib/api";
import { createQueryClient } from "../../src/lib/query";

const contribution: Movement = {
  id: "saved",
  type: "contribution",
  amount_cents: 3000,
  concept: "",
  date: "2026-09-16",
  payer_id: "ana",
  allocations: [
    { member_id: "bruno", amount_cents: 2000 },
    { member_id: "carla", amount_cents: 1000 },
  ],
  created_at: "2026-09-16T12:00:00Z",
  updated_at: "2026-09-16T12:00:00Z",
  version: 1,
};

async function setup(edit = false) {
  const group: Group = {
    id: "group",
    name: "Lisboa",
    start_date: "2026-09-16",
    end_date: "2026-09-17",
    today: "2026-09-16",
    timezone: "Europe/Madrid",
    version: 1,
    creator_member_id: "ana",
    my_member_id: "ana",
    role: "creator",
    members: ["Ana", "Bruno", "Carla", "Diego"].map((alias, position) => ({
      id: alias.toLowerCase(),
      alias,
      position,
      claimed: position === 0,
      is_creator: position === 0,
      version: 1,
    })),
    movements: edit ? [contribution] : [],
    balances: [],
    payments: [],
    settlement_text: "",
    total_cents: 0,
  };
  vi.spyOn(api, "group").mockResolvedValue(group);
  const save = vi.spyOn(api, "createMovement").mockResolvedValue(contribution);
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter
        initialEntries={[`/g/movements/${edit ? "saved" : "new"}?group=group`]}
      >
        <Routes>
          <Route
            path="/g/movements/:movementId"
            element={
              <GroupBoundary>
                <MovementPage />
              </GroupBoundary>
            }
          />
          <Route
            path="/g/movements/new"
            element={
              <GroupBoundary>
                <MovementPage />
              </GroupBoundary>
            }
          />
          <Route path="/g" element={<p>Guardado</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByLabelText("Importe total");
  if (!edit) {
    await user.click(screen.getByLabelText("Aportación"));
    await user.type(screen.getByLabelText("Importe total"), "30");
    await user.click(screen.getByLabelText("Bruno"));
    await user.click(screen.getByLabelText("Carla"));
  }
  async function fill(label: string, value: string) {
    await user.clear(screen.getByLabelText(label));
    await user.type(screen.getByLabelText(label), value);
  }
  async function manual() {
    await fill("Importe para Bruno", "20");
    await fill("Importe para Carla", "10");
  }
  return { user, save, fill, manual };
}

describe("contribution split preserves user intent", () => {
  it("keeps equal defaults until manual editing, then preserves drafts across recipient changes", async () => {
    const { user, manual } = await setup();
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("15,00");
    await manual();
    await user.click(screen.getByLabelText("Diego"));
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("20");
    expect(screen.getByLabelText("Importe para Carla")).toHaveValue("10");
    expect(screen.getByLabelText("Importe para Diego")).toHaveValue("0,00");
    await user.click(screen.getByLabelText("Carla"));
    expect(screen.getByRole("status")).toHaveTextContent("Faltan 10,00 €");
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("20");
    await user.click(screen.getByLabelText("Carla"));
    expect(screen.getByLabelText("Importe para Carla")).toHaveValue("10");
  });

  it("preserves manual amounts when the total or origin changes and reports missing/excess amounts", async () => {
    const { user, fill, manual } = await setup();
    await manual();
    await fill("Importe total", "40");
    expect(screen.getByRole("status")).toHaveTextContent("Faltan 10,00 €");
    await fill("Importe total", "25");
    expect(screen.getByRole("status")).toHaveTextContent("Sobran 5,00 €");
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("20");
    await user.selectOptions(screen.getByLabelText("Origen"), "carla");
    expect(
      screen.queryByLabelText("Importe para Carla"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("20");
    expect(screen.getByRole("status")).toHaveTextContent("Faltan 5,00 €");
  });

  it("blocks mismatched and invalid allocations, then saves the explicitly equalized split including cent remainders", async () => {
    const { user, fill, manual, save } = await setup();
    await manual();
    await fill("Importe total", "40");
    await user.click(
      screen.getByRole("button", { name: "Guardar movimiento" }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "sumar exactamente el total",
    );
    await fill("Importe para Bruno", "30.001");
    await user.click(
      screen.getByRole("button", { name: "Guardar movimiento" }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Revisa los importes");
    await user.click(screen.getByLabelText("Diego"));
    await user.click(
      screen.getByRole("button", { name: "Repartir por igual" }),
    );
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("13,34");
    expect(screen.getByLabelText("Importe para Carla")).toHaveValue("13,33");
    await user.click(
      screen.getByRole("button", { name: "Guardar movimiento" }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "group",
        expect.objectContaining({
          amount: "40",
          allocations: [
            { member_id: "bruno", amount: "13,34" },
            { member_id: "carla", amount: "13,33" },
            { member_id: "diego", amount: "13,33" },
          ],
        }),
      ),
    );
  });

  it("preserves stored contributions on first edit until equal distribution is requested", async () => {
    const { user, fill } = await setup(true);
    await user.click(screen.getByLabelText("Diego"));
    await fill("Importe total", "45");
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("20,00");
    expect(screen.getByLabelText("Importe para Carla")).toHaveValue("10,00");
    await user.click(
      screen.getByRole("button", { name: "Repartir por igual" }),
    );
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("15,00");
    await fill("Importe total", "60");
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("20,00");
  });

  it("resets defaults when starting a different contribution draft", async () => {
    const { user, manual } = await setup();
    await manual();
    await user.click(screen.getByLabelText("Gasto"));
    await user.click(screen.getByLabelText("Aportación"));
    expect(screen.getByLabelText("Bruno")).not.toBeChecked();
    await user.click(screen.getByLabelText("Bruno"));
    expect(screen.getByLabelText("Importe para Bruno")).toHaveValue("30,00");
  });
});
