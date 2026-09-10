import { describe, expect, it, vi } from "vitest";
import {
  type MigrationEffects,
  type MigrationStep,
  migrationCleanPath,
  migrationOrigins,
  migrationRoute,
  migrationUrl,
  runMigration,
} from "../../src/features/migration/migration";
import { ApiError } from "../../src/lib/api";
import {
  code,
  groupId,
  migrationGroup,
  migrationId,
  origins,
  token,
} from "../fixtures/migration";

const missingIdentity = () =>
  new ApiError(403, "identity_required", "Falta identidad");
function effects() {
  return {
    origins,
    api: {
      group: vi
        .fn<MigrationEffects["api"]["group"]>()
        .mockRejectedValue(missingIdentity()),
      metadata: vi
        .fn<MigrationEffects["api"]["metadata"]>()
        .mockResolvedValue({ ...migrationGroup(), access_role: "member" }),
      migrationStart: vi
        .fn<MigrationEffects["api"]["migrationStart"]>()
        .mockResolvedValue({ id: migrationId }),
      migrationAuthorize: vi
        .fn<MigrationEffects["api"]["migrationAuthorize"]>()
        .mockResolvedValue({ code }),
      migrationRedeem: vi
        .fn<MigrationEffects["api"]["migrationRedeem"]>()
        .mockResolvedValue(undefined),
      migrationConfirm: vi
        .fn<MigrationEffects["api"]["migrationConfirm"]>()
        .mockResolvedValue({ group: migrationGroup() }),
    },
    leave: vi.fn(),
    replaceHistory: vi.fn(),
    retryFrom: vi.fn(),
    finish: vi.fn(),
    fallback: vi.fn(),
  } satisfies MigrationEffects;
}

function route(url: string) {
  return migrationRoute(new URL(url), origins);
}

describe("migration URL boundary", () => {
  it("requires configured HTTPS origins on different cookie hosts", () => {
    expect(migrationOrigins(origins.source, origins.target)).toEqual(origins);
    expect(
      migrationOrigins("https://app.example:443", "https://app.example:8443"),
    ).toBeNull();
    expect(
      migrationOrigins("https://user@app.example", origins.source),
    ).toBeNull();
    expect(
      migrationOrigins(`${origins.source}/other`, origins.target),
    ).toBeNull();
    expect(
      migrationOrigins("http://127.0.0.1:4173", "http://localhost:4173"),
    ).toBeNull();
    expect(
      migrationOrigins("http://127.0.0.1:4173", "http://localhost:4173", true),
    ).toEqual({
      source: "http://127.0.0.1:4173",
      target: "http://localhost:4173",
    });
    expect(
      migrationOrigins("http://remote.example", "http://localhost:4173", true),
    ).toBeNull();
  });

  it("leaves other origins and normal destination routes untouched", () => {
    expect(route("https://preview.example/g#anything")).toEqual({
      kind: "bypass",
    });
    expect(route(`${origins.target}/g#${token}`)).toEqual({ kind: "bypass" });
    expect(route(`${origins.source}/privacy`)).toEqual({
      kind: "redirect",
      path: "/privacy",
    });
  });

  it("keeps the allowlisted source screen without treating its link as a session", () => {
    expect(route(`${origins.source}/g/options#${token}`)).toEqual({
      kind: "migrate",
      step: { phase: "source", path: "/g/options", groupId: undefined, token },
    });
    expect(route(`${origins.source}/g?group=${groupId}`)).toMatchObject({
      kind: "migrate",
      step: { groupId, phase: "source" },
    });
  });

  it.each([
    `#phase=arrive&group=${groupId}&path=https://evil.example`,
    `#phase=arrive&group=${groupId}&path=//evil.example`,
    `#phase=arrive&group=${groupId}&path=/g/../privacy`,
    `#phase=unknown&group=${groupId}`,
    `#phase=arrive&group=${groupId}&role=creator`,
    `#phase=arrive&group=${groupId}&group=${groupId}`,
    `#phase=arrive&group=not-a-uuid`,
    `#phase=arrive&group=${groupId}&token=short`,
    `?phase=redeem&group=${groupId}&id=${migrationId}&code=${code}`,
    `?phase=confirm&group=${groupId}&id=${migrationId}&token=${token}`,
    `?phase=confirm&group=${groupId}&id=${migrationId}#ignored`,
  ])("rejects untrusted parameters %s", (input) => {
    expect(route(`${origins.target}/g/migrate${input}`)).toEqual({
      kind: "invalid",
    });
  });

  it("accepts each phase only on its designated origin", () => {
    const authorize = {
      phase: "authorize",
      groupId,
      path: "/g",
      id: migrationId,
    } as const;
    expect(route(migrationUrl(origins.source, authorize))).toMatchObject({
      kind: "migrate",
      step: authorize,
    });
    expect(route(migrationUrl(origins.target, authorize))).toEqual({
      kind: "invalid",
    });
    const redeem = { ...authorize, phase: "redeem", code } as const;
    expect(route(migrationUrl(origins.source, redeem))).toEqual({
      kind: "invalid",
    });
    expect(route(migrationUrl(origins.target, redeem))).toMatchObject({
      kind: "migrate",
      step: redeem,
    });
  });

  it("serializes resumable confirmation with public identifiers only", () => {
    const confirm: MigrationStep = {
      phase: "confirm",
      groupId,
      id: migrationId,
      token,
      path: "/g/settlement",
    };
    const path = migrationCleanPath(confirm);
    const parsed = route(`${origins.target}${path}`);
    expect(parsed).toMatchObject({
      kind: "migrate",
      step: {
        phase: "confirm",
        groupId,
        id: migrationId,
        path: "/g/settlement",
        token: undefined,
      },
    });
    expect(path).not.toContain(token);
    expect(path).not.toContain("#");
  });
});

describe("cookie migration protocol", () => {
  it("preserves an existing destination member even when a stale fallback carries a creator link", async () => {
    const port = effects();
    port.api.group.mockResolvedValue(migrationGroup());
    port.api.metadata.mockResolvedValue({
      ...migrationGroup(),
      access_role: "creator",
    });
    await runMigration({ phase: "fallback", groupId, path: "/g", token }, port);
    expect(port.finish).toHaveBeenCalledWith(migrationGroup(), "/g", {
      token,
      role: "creator",
    });
    expect(port.fallback).not.toHaveBeenCalled();
    expect(port.api.migrationStart).not.toHaveBeenCalled();
  });

  it("prepares a fresh explicit attempt when confirmation has expired", async () => {
    const port = effects();
    port.api.migrationConfirm.mockRejectedValue(
      new ApiError(403, "migration_invalid", "Expired"),
    );
    await expect(
      runMigration(
        { phase: "confirm", groupId, id: migrationId, path: "/g" },
        port,
      ),
    ).rejects.toMatchObject({ code: "migration_invalid" });
    expect(port.retryFrom).toHaveBeenCalledWith({
      phase: "arrive",
      groupId,
      path: "/g",
      token: undefined,
    });
    expect(port.api.migrationStart).not.toHaveBeenCalled();
    expect(port.leave).not.toHaveBeenCalled();
  });
  it("resolves an old invite and forwards it without creating or claiming source sessions", async () => {
    const port = effects();
    await runMigration({ phase: "source", path: "/g/options", token }, port);
    expect(port.api.metadata).toHaveBeenCalledWith(token);
    expect(port.leave).toHaveBeenCalledWith(
      migrationUrl(origins.target, {
        phase: "arrive",
        groupId,
        path: "/g/options",
        token,
      }),
    );
    expect(port.api.migrationAuthorize).not.toHaveBeenCalled();
    expect(port.api.migrationStart).not.toHaveBeenCalled();
  });

  it("checks the destination first and preserves its existing identity and server-derived link role", async () => {
    const port = effects();
    const group = { ...migrationGroup(), my_member_id: "carla" };
    port.api.group.mockResolvedValue(group);
    port.api.metadata.mockResolvedValue({ ...group, access_role: "creator" });
    await runMigration(
      { phase: "arrive", groupId, path: "/g/options", token },
      port,
    );
    expect(port.api.group.mock.invocationCallOrder[0]).toBeLessThan(
      port.api.metadata.mock.invocationCallOrder[0],
    );
    expect(port.finish).toHaveBeenCalledWith(group, "/g/options", {
      token,
      role: "creator",
    });
    expect(port.api.migrationStart).not.toHaveBeenCalled();
  });

  it("rejects an entry token belonging to a different group before any migration write", async () => {
    const port = effects();
    port.api.metadata.mockResolvedValue({
      ...migrationGroup(),
      id: migrationId,
      access_role: "creator",
    });
    await expect(
      runMigration({ phase: "arrive", groupId, path: "/g", token }, port),
    ).rejects.toMatchObject({ code: "migration_invalid" });
    expect(port.api.migrationStart).not.toHaveBeenCalled();
    expect(port.leave).not.toHaveBeenCalled();
  });

  it("starts a bound request only without a destination identity", async () => {
    const port = effects();
    await runMigration({ phase: "arrive", groupId, path: "/g" }, port);
    expect(port.api.migrationStart).toHaveBeenCalledWith(groupId);
    expect(port.leave).toHaveBeenCalledWith(
      migrationUrl(origins.source, {
        phase: "authorize",
        groupId,
        path: "/g",
        id: migrationId,
      }),
    );
  });

  it("authorizes from the source cookie and returns a one-use code only in a fragment", async () => {
    const port = effects();
    await runMigration(
      { phase: "authorize", groupId, id: migrationId, path: "/g" },
      port,
    );
    expect(port.api.migrationAuthorize).toHaveBeenCalledWith(
      groupId,
      migrationId,
    );
    const destination = new URL(port.leave.mock.calls[0][0]);
    expect(destination.origin).toBe(origins.target);
    expect(destination.search).toBe("");
    expect(new URLSearchParams(destination.hash.slice(1)).get("code")).toBe(
      code,
    );
  });

  it("falls back to ordinary entry without stealing an occupied identity", async () => {
    const port = effects();
    port.api.migrationAuthorize.mockRejectedValue(missingIdentity());
    await runMigration(
      { phase: "authorize", groupId, id: migrationId, path: "/g", token },
      port,
    );
    expect(port.leave).toHaveBeenCalledWith(
      migrationUrl(origins.target, {
        phase: "fallback",
        groupId,
        path: "/g",
        token,
      }),
    );
    await runMigration({ phase: "fallback", groupId, path: "/g", token }, port);
    expect(port.fallback).toHaveBeenCalledWith(
      expect.objectContaining({ groupId, token }),
    );
    expect(port.api.migrationRedeem).not.toHaveBeenCalled();
  });

  it("installs the cookie, clears secrets, and only then confirms the transfer", async () => {
    const port = effects();
    await runMigration(
      {
        phase: "redeem",
        groupId,
        id: migrationId,
        path: "/g/options",
        token,
        code,
      },
      port,
    );
    expect(port.api.migrationRedeem).toHaveBeenCalledWith(
      groupId,
      migrationId,
      code,
    );
    expect(port.replaceHistory).toHaveBeenCalledWith(
      expect.stringContaining("?phase=confirm"),
    );
    expect(port.replaceHistory.mock.calls[0][0]).not.toContain(token);
    expect(port.replaceHistory.mock.calls[0][0]).not.toContain(code);
    expect(port.replaceHistory.mock.invocationCallOrder[0]).toBeLessThan(
      port.api.migrationConfirm.mock.invocationCallOrder[0],
    );
    expect(port.finish).toHaveBeenCalledWith(migrationGroup(), "/g/options", {
      token,
      role: "member",
    });
  });

  it("recovers a lost confirmation response through the already installed cookie", async () => {
    const port = effects();
    port.api.group
      .mockRejectedValueOnce(missingIdentity())
      .mockResolvedValueOnce(migrationGroup());
    port.api.migrationConfirm.mockRejectedValue(
      new ApiError(0, "network_error", "Lost response"),
    );
    await runMigration(
      { phase: "confirm", groupId, id: migrationId, path: "/g" },
      port,
    );
    expect(port.finish).toHaveBeenCalledWith(migrationGroup(), "/g", undefined);
    expect(port.api.migrationConfirm).toHaveBeenCalledTimes(1);
    expect(port.api.migrationStart).not.toHaveBeenCalled();
  });

  it("does not automatically replay a failed one-use code and prepares a fresh explicit retry", async () => {
    const port = effects();
    port.api.migrationRedeem.mockRejectedValue(
      new ApiError(409, "migration_used", "Used"),
    );
    await expect(
      runMigration(
        { phase: "redeem", groupId, id: migrationId, path: "/g", code },
        port,
      ),
    ).rejects.toMatchObject({ code: "migration_used" });
    expect(port.retryFrom).toHaveBeenCalledWith({
      phase: "arrive",
      groupId,
      path: "/g",
      token: undefined,
    });
    expect(port.api.migrationStart).not.toHaveBeenCalled();
    expect(port.api.migrationConfirm).not.toHaveBeenCalled();
    expect(port.leave).not.toHaveBeenCalled();
  });

  it("keeps a destination session that appeared while a transfer was pending", async () => {
    const port = effects();
    port.api.migrationRedeem.mockRejectedValue(
      new ApiError(409, "migration_target_occupied", "Already active"),
    );
    port.api.group.mockResolvedValue(migrationGroup());
    await runMigration(
      { phase: "redeem", groupId, id: migrationId, path: "/g", code },
      port,
    );
    expect(port.finish).toHaveBeenCalledWith(migrationGroup(), "/g", undefined);
    expect(port.api.migrationConfirm).not.toHaveBeenCalled();
  });
});
