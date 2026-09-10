import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("typed HTTP adapter", () => {
  it("uses cookie-only POSTs for every migration phase and never returns a session secret", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "migration-id" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "one-use-code" })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ group: { id: "group-id" } })),
      );
    vi.stubGlobal("fetch", transport);
    await api.migrationStart("group-id");
    await api.migrationAuthorize("group-id", "migration-id");
    await api.migrationRedeem("group-id", "migration-id", "one-use-code");
    await api.migrationConfirm("group-id", "migration-id");
    for (const [path, request] of transport.mock.calls) {
      expect(path).toMatch(/^\/api\/group\/migration\/\w+$/);
      expect(request).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-Appachas-Group": "group-id",
          "Content-Type": "application/json",
        },
      });
      expect(request.headers).not.toHaveProperty("Authorization");
    }
    expect(
      transport.mock.calls.map(([, request]) => JSON.parse(request.body)),
    ).toEqual([
      {},
      { id: "migration-id" },
      { id: "migration-id", code: "one-use-code" },
      { id: "migration-id" },
    ]);
  });
  it("uses only the public group reference and session cookie after authentication", async () => {
    // Arrange / Given
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "fixture-group" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", transport);
    // Act / When
    await api.group("fixture-group");
    // Assert / Then
    expect(transport).toHaveBeenCalledWith(
      "/api/group",
      expect.objectContaining({
        credentials: "same-origin",
        headers: { "X-Appachas-Group": "fixture-group" },
      }),
    );
  });
  it("uses the link token only when exchanging it for a session", async () => {
    // Arrange / Given
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ group: { id: "fixture-group" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", transport);
    // Act / When
    await api.startSession("fixture-entry-secret", "fixture-group");
    // Assert / Then
    expect(transport).toHaveBeenCalledWith(
      "/api/group/session",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-Appachas-Group": "fixture-group",
          Authorization: "Bearer fixture-entry-secret",
        },
      }),
    );
  });
  it("preserves the stable conflict code and the Spanish server explanation", async () => {
    // Arrange / Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "stale_version",
            detail: "Otra persona ha cambiado este movimiento.",
            status: 409,
          }),
          { status: 409 },
        ),
      ),
    );
    // Act / When
    const result = api.group("fixture-secret");
    // Assert / Then
    await expect(result).rejects.toMatchObject({
      status: 409,
      code: "stale_version",
      message: "Otra persona ha cambiado este movimiento.",
    });
  });
  it("presents a recoverable message without leaking transport details", async () => {
    // Arrange / Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private request details")),
    );
    // Act / When
    const result = api.group("fixture-secret");
    // Assert / Then
    await expect(result).rejects.toEqual(
      new ApiError(
        0,
        "network_error",
        "No se pudo conectar. Comprueba tu conexión y vuelve a intentarlo.",
      ),
    );
  });
});
