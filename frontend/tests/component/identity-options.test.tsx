import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  GroupBoundary,
  groupKey,
} from "../../src/features/groups/GroupContext";
import { OptionsPage } from "../../src/features/groups/OptionsPage";
import { api, type Group } from "../../src/lib/api";
import { groupPath } from "../../src/lib/format";
import { createQueryClient } from "../../src/lib/query";

function memberGroup(alias = "Bruno", version = 1): Group {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Weekend",
    start_date: "2026-09-10",
    end_date: "2026-09-17",
    timezone: "Europe/Madrid",
    today: "2026-09-10",
    version,
    creator_member_id: "ana",
    my_member_id: "bruno",
    role: "member",
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
        alias,
        position: 1,
        claimed: true,
        is_creator: false,
        version,
      },
      {
        id: "carla",
        alias: "Carla",
        position: 2,
        claimed: false,
        is_creator: false,
        version: 1,
      },
    ],
    movements: [],
    balances: [],
    payments: [],
    settlement_text: "",
    total_cents: 0,
  };
}

function renderOptions(group: Group) {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[groupPath(group.id, "/options")]}>
        <Routes>
          <Route
            path="/g/options"
            element={
              <GroupBoundary>
                <OptionsPage />
              </GroupBoundary>
            }
          />
          <Route path="/g" element={<p>Identidad actualizada</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("identity options while server data refreshes", () => {
  it("keeps a selected identity and its button while the alias refresh finishes", async () => {
    // Arrange / Given: the alias write succeeded, but its group refresh is delayed.
    const user = userEvent.setup();
    const initial = memberGroup();
    const renamed = memberGroup("Bruno nuevo", 2);
    let finishRefresh: (group: Group) => void = () => undefined;
    const refreshed = new Promise<Group>((resolve) => {
      finishRefresh = resolve;
    });
    const read = vi
      .spyOn(api, "group")
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(refreshed);
    vi.spyOn(api, "renameMember").mockResolvedValue(renamed.members[1]);
    const claim = vi
      .spyOn(api, "claim")
      .mockResolvedValue({ group: { ...renamed, my_member_id: "carla" } });
    renderOptions(initial);
    const alias = await screen.findByLabelText("Tu alias");
    await user.clear(alias);
    await user.type(alias, "Bruno nuevo");
    await user.click(screen.getByRole("button", { name: "Guardar alias" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await user.selectOptions(
      screen.getByLabelText("Cambiar identidad"),
      "carla",
    );
    const switchButton = screen.getByRole("button", {
      name: "Cambiar identidad",
    });

    // Act / When: the refresh arrives between selection and the user's click.
    await act(async () => {
      finishRefresh(renamed);
      await refreshed;
    });

    // Assert / Then: the same control stays usable and submits the selected member.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar alias" }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText("Cambiar identidad")).toHaveValue("carla");
    expect(screen.getByRole("button", { name: "Cambiar identidad" })).toBe(
      switchButton,
    );
    expect(switchButton).toBeEnabled();
    await user.click(switchButton);
    await waitFor(() =>
      expect(claim).toHaveBeenCalledWith(initial.id, { member_id: "carla" }),
    );
  });

  it("updates an untouched alias when another device renames the same member", async () => {
    // Arrange / Given
    const initial = memberGroup();
    vi.spyOn(api, "group").mockResolvedValue(initial);
    const client = renderOptions(initial);
    await screen.findByLabelText("Tu alias");
    // Act / When
    await act(async () => {
      client.setQueryData(groupKey(initial.id), {
        ...memberGroup("Alias remoto", 2),
        name: "Server refresh",
      });
    });
    // Assert / Then
    await waitFor(() =>
      expect(screen.getByLabelText("Tu alias")).toHaveValue("Alias remoto"),
    );
  });

  it("preserves a local alias draft when another device updates the member", async () => {
    // Arrange / Given
    const user = userEvent.setup();
    const initial = memberGroup();
    vi.spyOn(api, "group").mockResolvedValue(initial);
    const client = renderOptions(initial);
    const alias = await screen.findByLabelText("Tu alias");
    await user.clear(alias);
    await user.type(alias, "Mi borrador");
    // Act / When
    await act(async () => {
      client.setQueryData(groupKey(initial.id), {
        ...memberGroup("Alias remoto", 2),
        name: "Server refresh",
      });
    });
    // Assert / Then
    await screen.findByText("Server refresh");
    expect(screen.getByLabelText("Tu alias")).toHaveValue("Mi borrador");
  });
});
