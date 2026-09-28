import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SharePage } from "../../src/features/groups/SharePage";
import { forgetEntryLinks, rememberEntryLinks } from "../../src/lib/access";
import * as download from "../../src/lib/access-download";

vi.mock("../../src/features/groups/GroupContext", () => ({
  useGroup: () => ({
    groupId: "share-test",
    group: {
      name: "Lisboa",
      start_date: "2026-09-16",
      end_date: "2026-09-20",
      role: "creator",
    },
  }),
}));

describe("private access", () => {
  it("downloads only on request and keeps the private credential out of invitation sharing", async () => {
    const user = userEvent.setup();
    const save = vi
      .spyOn(download, "downloadPrivateAccess")
      .mockImplementation(() => {});
    const clipboard = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    rememberEntryLinks("share-test", {
      memberUrl: "https://example.test/g#invitation",
      creatorUrl: "https://example.test/g#private",
    });
    render(
      <MemoryRouter>
        <SharePage />
      </MemoryRouter>,
    );
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copiar invitación" }));
    expect(clipboard).toHaveBeenCalledWith("https://example.test/g#invitation");
    await user.click(
      screen.getByRole("button", { name: "Descargar acceso privado" }),
    );
    expect(save).toHaveBeenCalledWith(
      "Lisboa",
      "https://example.test/g#private",
    );
    expect(screen.getByText(/Descarga iniciada/)).toBeInTheDocument();
    forgetEntryLinks("share-test");
  });

  it("explains where to find a saved copy when the document no longer has the links", () => {
    forgetEntryLinks("share-test");
    render(
      <MemoryRouter>
        <SharePage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Descargar acceso privado" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Tu sesión actual sigue funcionando/),
    ).toHaveTextContent("appachas-acceso-privado.txt");
    expect(
      screen.getByText(/La invitación ya no está disponible/),
    ).toHaveTextContent("búscala en vuestro chat");
  });
});
