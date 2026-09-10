import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Feedback, Loading, PageHeading } from "../../components/common";
import { Button } from "../../components/ui/button";
import {
  forgetPendingEntry,
  rememberEntryToken,
  rememberPendingEntry,
} from "../../lib/access";
import { ApiError, api } from "../../lib/api";
import { groupPath } from "../../lib/format";
import { GroupUnavailable, groupKey } from "../groups/GroupContext";
import {
  type MigrationOrigins,
  type MigrationRoute,
  type MigrationStep,
  migrationCleanPath,
  migrationOrigins,
  migrationRoute,
  runMigration,
} from "./migration";

const configuredOrigins = migrationOrigins(
  import.meta.env.VITE_MIGRATION_SOURCE_ORIGIN || "https://appachas.vercel.app",
  import.meta.env.VITE_MIGRATION_TARGET_ORIGIN || "https://appachas.es",
  import.meta.env.DEV || import.meta.env.MODE === "migration-test",
);

export type MigrationBrowser = {
  origin: string;
  replaceHistory: (path: string) => void;
  leave: (url: string) => void;
};

export function DomainMigrationGate({
  children,
  origins = configuredOrigins,
  browser = {
    origin: window.location.origin,
    replaceHistory: (path) => window.history.replaceState(null, "", path),
    leave: (url) => window.location.replace(url),
  },
}: {
  children: ReactNode;
  origins?: MigrationOrigins | null;
  browser?: MigrationBrowser;
}) {
  const location = useLocation();
  const route = migrationRoute(
    { ...location, origin: browser.origin },
    origins,
  );
  if (route.kind === "bypass" || !origins) return children;
  return (
    <MigrationPage
      key={location.key}
      route={route}
      origins={origins}
      browser={browser}
    />
  );
}

function MigrationPage({
  route,
  origins,
  browser,
}: {
  route: Exclude<MigrationRoute, { kind: "bypass" }>;
  origins: MigrationOrigins;
  browser: MigrationBrowser;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const step = useRef<MigrationStep | null>(
    route.kind === "migrate" ? route.step : null,
  );
  const started = useRef(false);
  const consumed = useRef(false);
  const migration = useMutation({
    mutationFn: async () => {
      if (!step.current) return;
      await runMigration(step.current, {
        origins,
        api,
        leave: browser.leave,
        replaceHistory: browser.replaceHistory,
        retryFrom: (next) => {
          step.current = next;
        },
        finish: (group, path, link) => {
          forgetPendingEntry(group.id);
          if (link) rememberEntryToken(group.id, link.token, link.role);
          queryClient.setQueryData(groupKey(group.id), group);
          navigate(groupPath(group.id, path.slice(2)), {
            replace: true,
            state: null,
          });
        },
        fallback: ({ groupId, path, token }) => {
          if (token) rememberPendingEntry(groupId, token);
          navigate(groupPath(groupId, path.slice(2)), {
            replace: true,
            state: null,
          });
        },
      });
    },
    retry: false,
    networkMode: "always",
  });
  const begin = migration.mutate;
  useLayoutEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    // Secrets stay only in this mounted component's memory. Never retain the
    // consumed fragment in the URL or React Router's history state.
    browser.replaceHistory(
      route.kind === "migrate"
        ? migrationCleanPath(route.step)
        : route.kind === "redirect"
          ? route.path
          : "/g/migrate",
    );
  }, [browser, route]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (route.kind === "redirect")
      browser.leave(`${origins.target}${route.path}`);
    else if (route.kind === "migrate") begin();
    // The ref also prevents React StrictMode from sending a second one-use POST.
  }, [begin, browser, origins.target, route]);

  const invalid = route.kind === "invalid";
  const error = migration.error;
  if (error instanceof ApiError && error.status === 404)
    return <GroupUnavailable />;
  return (
    <section className="narrow-page stack">
      <PageHeading
        title={
          invalid || error
            ? "No pudimos trasladar tu acceso"
            : "Tu grupo tiene nueva dirección"
        }
      />
      <div className="card stack">
        {invalid || error ? (
          <>
            <Feedback
              error={
                invalid
                  ? "Este enlace de traslado no es válido. Vuelve a abrir el enlace original del grupo."
                  : error instanceof ApiError && error.code === "network_error"
                    ? "Se ha interrumpido la conexión. Comprueba tu conexión y vuelve a intentarlo."
                    : "No se ha completado el traslado. Vuelve a intentarlo o abre el enlace original del grupo."
              }
            />
            <p>
              El traslado no reclama otra identidad ni sustituye una sesión que
              ya tengas en el nuevo dominio.
            </p>
            {!invalid && (
              <Button onClick={() => begin()} disabled={migration.isPending}>
                Volver a intentar
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/">Volver al inicio</Link>
            </Button>
          </>
        ) : (
          <>
            <p>
              Estamos preparando tu acceso en el nuevo dominio. Mantendrás tu
              identidad y los datos de vuestro grupo.
            </p>
            <Loading label="Trasladando tu acceso…" />
          </>
        )}
      </div>
    </section>
  );
}
