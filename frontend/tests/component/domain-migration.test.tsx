import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DomainMigrationGate,
  type MigrationBrowser,
} from "../../src/features/migration/DomainMigrationGate";
import { migrationUrl } from "../../src/features/migration/migration";
import { forgetEntryLinks, pendingEntry } from "../../src/lib/access";
import { ApiError, api } from "../../src/lib/api";
import { createQueryClient } from "../../src/lib/query";
import {
  code,
  groupId,
  migrationGroup,
  migrationId,
  origins,
  token,
} from "../fixtures/migration";

afterEach(() => forgetEntryLinks(groupId));

function Destination() {
  const location = useLocation();
  return (
    <p>
      Destino: {location.pathname}
      {location.search}
      {location.hash}; estado: {JSON.stringify(location.state)}
    </p>
  );
}

function renderMigration(url: string) {
  const parsed = new URL(url);
  const browser: MigrationBrowser = {
    origin: parsed.origin,
    replaceHistory: vi.fn(),
    leave: vi.fn(),
  };
  const client = createQueryClient();
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[parsed.pathname + parsed.search + parsed.hash]}
        >
          <DomainMigrationGate browser={browser} origins={origins}>
            <Destination />
          </DomainMigrationGate>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  return browser;
}

describe("domain migration gate", () => {
  it("redeems and confirms only once in StrictMode, then navigates without secret history state", async () => {
    vi.spyOn(api, "group").mockRejectedValue(
      new ApiError(403, "identity_required", "Missing"),
    );
    const redeem = vi
      .spyOn(api, "migrationRedeem")
      .mockResolvedValue(undefined);
    const confirm = vi
      .spyOn(api, "migrationConfirm")
      .mockResolvedValue({ group: migrationGroup() });
    const browser = renderMigration(
      migrationUrl(origins.target, {
        phase: "redeem",
        groupId,
        id: migrationId,
        code,
        path: "/g/options",
      }),
    );
    expect(
      await screen.findByText(
        `Destino: /g/options?group=${groupId}; estado: null`,
      ),
    ).toBeInTheDocument();
    expect(redeem).toHaveBeenCalledExactlyOnceWith(groupId, migrationId, code);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(groupId, migrationId);
    for (const [path] of vi.mocked(browser.replaceHistory).mock.calls) {
      expect(path).not.toContain(code);
      expect(path).not.toContain("#");
    }
  });

  it("shows the usual unavailable screen for a closed, expired, or invalid group", async () => {
    vi.spyOn(api, "group").mockRejectedValue(
      new ApiError(404, "group_unavailable", "Unavailable"),
    );
    const start = vi.spyOn(api, "migrationStart");
    const browser = renderMigration(
      migrationUrl(origins.target, { phase: "arrive", groupId, path: "/g" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Grupo no disponible" }),
    ).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    expect(browser.leave).not.toHaveBeenCalled();
  });
  it("consumes secrets before requests, and sends a one-use authorize POST only once in StrictMode", async () => {
    const persist = vi.spyOn(Storage.prototype, "setItem");
    const authorize = vi
      .spyOn(api, "migrationAuthorize")
      .mockResolvedValue({ code });
    const metadata = vi
      .spyOn(api, "metadata")
      .mockResolvedValue({ ...migrationGroup(), access_role: "member" });
    const browser = renderMigration(
      migrationUrl(origins.source, {
        phase: "authorize",
        id: migrationId,
        groupId,
        path: "/g/options",
        token,
      }),
    );
    await waitFor(() => expect(browser.leave).toHaveBeenCalledTimes(1));
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(browser.replaceHistory).toHaveBeenCalledWith("/g/migrate");
    expect(
      vi.mocked(browser.replaceHistory).mock.invocationCallOrder[0],
    ).toBeLessThan(metadata.mock.invocationCallOrder[0]);
    expect(persist).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(token);
    expect(document.body.textContent).not.toContain(code);
  });

  it("shows safe feedback for a manipulated link without network or navigation", async () => {
    const metadata = vi.spyOn(api, "metadata");
    const browser = renderMigration(
      `${origins.target}/g/migrate#phase=arrive&group=${groupId}&token=${token}&path=https://evil.example`,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no es válido");
    expect(browser.replaceHistory).toHaveBeenCalledWith("/g/migrate");
    expect(browser.leave).not.toHaveBeenCalled();
    expect(metadata).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(token);
  });

  it("retries a failed request only after an explicit click", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "group").mockRejectedValue(
      new ApiError(403, "identity_required", "Missing"),
    );
    const start = vi
      .spyOn(api, "migrationStart")
      .mockRejectedValueOnce(
        new ApiError(0, "network_error", "private details"),
      )
      .mockResolvedValueOnce({ id: migrationId });
    const browser = renderMigration(
      migrationUrl(origins.target, { phase: "arrive", groupId, path: "/g" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("conexión");
    expect(start).toHaveBeenCalledTimes(1);
    expect(browser.leave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Volver a intentar" }));
    await waitFor(() => expect(browser.leave).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain("private details");
  });

  it("resumes confirmation after a reload using only public query identifiers", async () => {
    vi.spyOn(api, "group").mockRejectedValue(
      new ApiError(403, "identity_required", "Missing"),
    );
    const confirm = vi
      .spyOn(api, "migrationConfirm")
      .mockResolvedValue({ group: migrationGroup() });
    const redeem = vi.spyOn(api, "migrationRedeem");
    renderMigration(
      migrationUrl(origins.target, {
        phase: "confirm",
        groupId,
        id: migrationId,
        path: "/g/options",
      }),
    );
    expect(
      await screen.findByText(
        `Destino: /g/options?group=${groupId}; estado: null`,
      ),
    ).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(groupId, migrationId);
    expect(redeem).not.toHaveBeenCalled();
  });

  it("hands ordinary entry a token in memory without returning it to the URL or storage", async () => {
    const persist = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(api, "group").mockRejectedValue(
      new ApiError(403, "identity_required", "Missing"),
    );
    vi.spyOn(api, "metadata").mockResolvedValue({
      ...migrationGroup(),
      access_role: "member",
    });
    const claim = vi.spyOn(api, "claimInitial");
    renderMigration(
      migrationUrl(origins.target, {
        phase: "fallback",
        groupId,
        path: "/g",
        token,
      }),
    );
    expect(
      await screen.findByText(`Destino: /g?group=${groupId}; estado: null`),
    ).toBeInTheDocument();
    expect(pendingEntry(groupId)).toBe(token);
    expect(persist).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });
});
