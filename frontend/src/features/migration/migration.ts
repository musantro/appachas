import { ApiError, type api, type Group, type Metadata } from "../../lib/api";
import { groupPath } from "../../lib/format";

export type MigrationOrigins = { source: string; target: string };
export type MigrationLocation = {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
};
type GroupDestination = { groupId: string; path: string; token?: string };
export type MigrationStep =
  | { phase: "source"; path: string; groupId?: string; token?: string }
  | ({ phase: "arrive" } & GroupDestination)
  | ({ phase: "fallback" } & GroupDestination)
  | ({ phase: "authorize"; id: string } & GroupDestination)
  | ({ phase: "confirm"; id: string } & GroupDestination)
  | ({ phase: "redeem"; id: string; code: string } & GroupDestination);
export type MigrationRoute =
  | { kind: "bypass" }
  | { kind: "invalid" }
  | { kind: "redirect"; path: "/" | "/privacy" }
  | { kind: "migrate"; step: MigrationStep };

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{40,256}$/;
const codePattern = /^[A-Za-z0-9_-]{43}$/;
const fixedPaths = new Set([
  "/g",
  "/g/share",
  "/g/options",
  "/g/settlement",
  "/g/movements/new",
]);

export function migrationOrigins(
  source: string,
  target: string,
  allowLocalHttp = false,
): MigrationOrigins | null {
  try {
    const urls = [new URL(source), new URL(target)];
    for (const url of urls) {
      if (
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        return null;
      if (
        url.protocol !== "https:" &&
        !(
          allowLocalHttp &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        return null;
    }
    if (urls[0].hostname === urls[1].hostname) return null;
    return { source: urls[0].origin, target: urls[1].origin };
  } catch {
    return null;
  }
}

export function migrationPath(path: string): boolean {
  return (
    fixedPaths.has(path) ||
    (path.startsWith("/g/movements/") &&
      uuid.test(path.slice("/g/movements/".length)))
  );
}

function parameterSet(raw: string, allowed: string[]): URLSearchParams | null {
  if (raw.length > 2048) return null;
  const params = new URLSearchParams(raw);
  for (const key of params.keys())
    if (!allowed.includes(key) || params.getAll(key).length !== 1) return null;
  return params;
}

export function migrationRoute(
  location: MigrationLocation,
  origins: MigrationOrigins | null,
): MigrationRoute {
  if (!origins || ![origins.source, origins.target].includes(location.origin))
    return { kind: "bypass" };
  const source = location.origin === origins.source;
  if (source && (location.pathname === "/" || location.pathname === "/privacy"))
    return { kind: "redirect", path: location.pathname };
  if (location.pathname !== "/g/migrate") {
    if (!source) return { kind: "bypass" };
    if (!migrationPath(location.pathname)) return { kind: "invalid" };
    const params = parameterSet(location.search.slice(1), ["group"]);
    if (!params) return { kind: "invalid" };
    const groupId = params.get("group") ?? undefined;
    let token: string | undefined;
    try {
      token = location.hash
        ? decodeURIComponent(location.hash.slice(1))
        : undefined;
    } catch {
      return { kind: "invalid" };
    }
    if (
      (groupId && !uuid.test(groupId)) ||
      (token && !tokenPattern.test(token)) ||
      (!groupId && !token)
    )
      return { kind: "invalid" };
    return {
      kind: "migrate",
      step: {
        phase: "source",
        path: location.pathname,
        groupId: groupId?.toLowerCase(),
        token,
      },
    };
  }
  if (location.hash && location.search) return { kind: "invalid" };
  const params = parameterSet(
    (location.hash || location.search).slice(1),
    location.hash
      ? ["phase", "id", "group", "path", "token", "code"]
      : ["phase", "id", "group", "path"],
  );
  if (!params) return { kind: "invalid" };
  const phase = params.get("phase");
  const groupId = params.get("group");
  const path = params.get("path") ?? "/g";
  const token = params.get("token") ?? undefined;
  const id = params.get("id");
  const code = params.get("code");
  if (
    !groupId ||
    !uuid.test(groupId) ||
    !migrationPath(path) ||
    (token && !tokenPattern.test(token))
  )
    return { kind: "invalid" };
  const destination = { groupId: groupId.toLowerCase(), path, token };
  if (phase === "confirm" && !source && !location.hash && id && uuid.test(id))
    return {
      kind: "migrate",
      step: { ...destination, phase, id: id.toLowerCase() },
    };
  if (!location.hash) return { kind: "invalid" };
  if ((phase === "arrive" || phase === "fallback") && !source && !id && !code)
    return { kind: "migrate", step: { ...destination, phase } };
  if (phase === "authorize" && source && id && uuid.test(id) && !code)
    return {
      kind: "migrate",
      step: { ...destination, phase, id: id.toLowerCase() },
    };
  if (
    phase === "redeem" &&
    !source &&
    id &&
    uuid.test(id) &&
    code &&
    codePattern.test(code)
  )
    return {
      kind: "migrate",
      step: { ...destination, phase, id: id.toLowerCase(), code },
    };
  return { kind: "invalid" };
}

export function migrationUrl(
  origin: string,
  step: Exclude<MigrationStep, { phase: "source" }>,
): string {
  const params = new URLSearchParams({
    phase: step.phase,
    group: step.groupId,
    path: step.path,
  });
  if ("id" in step) params.set("id", step.id);
  if (step.phase === "redeem") params.set("code", step.code);
  if (step.token && step.phase !== "confirm") params.set("token", step.token);
  return `${origin}/g/migrate${step.phase === "confirm" ? "?" : "#"}${params}`;
}

export function migrationCleanPath(step: MigrationStep): string {
  if (step.phase === "confirm") {
    const url = new URL(migrationUrl("https://appachas.es", step));
    return url.pathname + url.search;
  }
  if (step.phase === "source")
    return step.groupId
      ? groupPath(step.groupId, step.path.slice(2))
      : step.path;
  return "/g/migrate";
}

export type MigrationEffects = {
  origins: MigrationOrigins;
  api: Pick<
    typeof api,
    | "group"
    | "metadata"
    | "migrationStart"
    | "migrationAuthorize"
    | "migrationRedeem"
    | "migrationConfirm"
  >;
  leave: (url: string) => void;
  replaceHistory: (path: string) => void;
  retryFrom: (step: MigrationStep) => void;
  finish: (
    group: Group,
    path: string,
    link?: { token: string; role: "creator" | "member" },
  ) => void;
  fallback: (destination: GroupDestination) => void;
};

function invalidMigration(): ApiError {
  return new ApiError(
    403,
    "migration_invalid",
    "No se pudo verificar este enlace. Vuelve a abrir el enlace original del grupo.",
  );
}

async function metadataFor(
  step: MigrationStep,
  effects: MigrationEffects,
): Promise<Metadata | undefined> {
  if (!step.token) return undefined;
  const metadata = await effects.api.metadata(step.token);
  if ((step.groupId && metadata.id !== step.groupId) || !metadata.access_role)
    throw invalidMigration();
  return metadata;
}

async function currentGroup(
  groupId: string,
  effects: MigrationEffects,
): Promise<Group | null> {
  try {
    const group = await effects.api.group(groupId);
    if (group.id !== groupId) throw invalidMigration();
    return group;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 403 &&
      error.code === "identity_required"
    )
      return null;
    throw error;
  }
}

export async function runMigration(
  step: MigrationStep,
  effects: MigrationEffects,
): Promise<void> {
  const existing =
    step.phase === "arrive" ||
    step.phase === "confirm" ||
    step.phase === "fallback"
      ? await currentGroup(step.groupId, effects)
      : null;
  const metadata = await metadataFor(step, effects);
  const complete = (group: Group) => {
    if (group.id !== step.groupId) throw invalidMigration();
    const role = metadata?.access_role;
    effects.finish(
      group,
      step.path,
      step.token && role ? { token: step.token, role } : undefined,
    );
  };
  if (step.phase === "source") {
    const groupId = step.groupId ?? metadata?.id;
    if (!groupId) throw invalidMigration();
    effects.leave(
      migrationUrl(effects.origins.target, {
        phase: "arrive",
        groupId,
        path: step.path,
        token: step.token,
      }),
    );
    return;
  }
  if (step.phase === "fallback") {
    if (existing) {
      complete(existing);
      return;
    }
    effects.fallback(step);
    return;
  }
  if (step.phase === "arrive") {
    if (existing) {
      complete(existing);
      return;
    }
    const started = await effects.api.migrationStart(step.groupId);
    if (!uuid.test(started.id)) throw invalidMigration();
    effects.leave(
      migrationUrl(effects.origins.source, {
        ...step,
        phase: "authorize",
        id: started.id,
      }),
    );
    return;
  }
  if (step.phase === "authorize") {
    effects.retryFrom({
      phase: "source",
      groupId: step.groupId,
      path: step.path,
      token: step.token,
    });
    try {
      const result = await effects.api.migrationAuthorize(
        step.groupId,
        step.id,
      );
      if (!codePattern.test(result.code)) throw invalidMigration();
      effects.leave(
        migrationUrl(effects.origins.target, {
          ...step,
          phase: "redeem",
          code: result.code,
        }),
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === "identity_required"
      )
        effects.leave(
          migrationUrl(effects.origins.target, {
            phase: "fallback",
            groupId: step.groupId,
            path: step.path,
            token: step.token,
          }),
        );
      else throw error;
    }
    return;
  }
  if (step.phase === "redeem") {
    effects.retryFrom({
      phase: "arrive",
      groupId: step.groupId,
      path: step.path,
      token: step.token,
    });
    try {
      await effects.api.migrationRedeem(step.groupId, step.id, step.code);
    } catch (error) {
      const existing = await currentGroup(step.groupId, effects).catch(
        () => null,
      );
      if (existing) {
        complete(existing);
        return;
      }
      throw error;
    }
    const confirmation: MigrationStep = {
      phase: "confirm",
      groupId: step.groupId,
      id: step.id,
      path: step.path,
      token: step.token,
    };
    effects.retryFrom(confirmation);
    effects.replaceHistory(migrationCleanPath(confirmation));
    await runMigration(confirmation, effects);
    return;
  }
  if (existing) {
    complete(existing);
    return;
  }
  try {
    const result = await effects.api.migrationConfirm(step.groupId, step.id);
    complete(result.group);
  } catch (error) {
    const recovered = await currentGroup(step.groupId, effects).catch(
      () => null,
    );
    if (recovered) complete(recovered);
    else {
      if (
        error instanceof ApiError &&
        (error.status === 403 || error.status === 409)
      ) {
        effects.retryFrom({
          phase: "arrive",
          groupId: step.groupId,
          path: step.path,
          token: step.token,
        });
      }
      throw error;
    }
  }
}
