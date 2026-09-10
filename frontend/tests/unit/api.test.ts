import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("typed HTTP adapter", () => {
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
