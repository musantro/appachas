import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Feedback, Loading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { rememberEntryToken } from "../../lib/access";
import { ApiError, api, type Group } from "../../lib/api";
import { groupPath } from "../../lib/format";
import { ClaimIdentity } from "./ClaimIdentity";

const GroupContext = createContext<{ groupId: string; group: Group } | null>(
  null,
);

export function useGroup() {
  const context = useContext(GroupContext);
  if (!context) throw new Error("Missing group context");
  return context;
}

export const groupKey = (groupId: string) => ["group", groupId] as const;

export function GroupUnavailable() {
  return (
    <section className="card narrow-page empty-state">
      <div className="empty-icon">
        <ArrowLeft size={28} aria-hidden="true" />
      </div>
      <h1>Grupo no disponible</h1>
      <p>
        El enlace no es válido o el grupo ya se ha cerrado o eliminado.
        Comprueba el enlace con la persona que lo compartió.
      </p>
      <Button asChild>
        <Link to="/">Crear un nuevo grupo</Link>
      </Button>
    </section>
  );
}

function SessionRequired() {
  return (
    <section className="card narrow-page empty-state">
      <h1>Vuelve a abrir el enlace del grupo</h1>
      <p>
        Este navegador ya no tiene una identidad activa. Abre el enlace de
        integrantes que compartisteis; si tu identidad está ocupada, pide al
        creador que la libere. Si eres el creador, usa tu enlace privado.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </section>
  );
}

export function GroupBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  let entryToken = "";
  try {
    entryToken = decodeURIComponent(location.hash.slice(1));
  } catch {
    return <GroupUnavailable />;
  }
  if (entryToken) return <GroupEntry key={entryToken} token={entryToken} />;
  const groupId = new URLSearchParams(location.search).get("group");
  if (!groupId) return <GroupUnavailable />;
  return (
    <GroupSession key={groupId} groupId={groupId}>
      {children}
    </GroupSession>
  );
}

function GroupEntry({ token }: { token: string }) {
  const entryId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const metadata = useQuery({
    queryKey: ["entry-metadata", entryId],
    queryFn: () => api.metadata(token),
    retry: false,
  });
  function finishSession(group: Group) {
    if (metadata.data?.access_role)
      rememberEntryToken(group.id, token, metadata.data.access_role);
    queryClient.setQueryData(groupKey(group.id), group);
    navigate(groupPath(group.id, location.pathname.slice(2)), {
      replace: true,
      state: null,
    });
  }
  const session = useMutation({
    mutationFn: (groupId: string) => api.startSession(token, groupId),
    onSuccess: (result) => finishSession(result.group),
  });
  const started = useRef(false);
  const start = session.mutate;
  useEffect(() => {
    if (metadata.data && !started.current) {
      started.current = true;
      start(metadata.data.id);
    }
  }, [metadata.data, start]);
  if (metadata.error instanceof ApiError && metadata.error.status === 404)
    return <GroupUnavailable />;
  if (metadata.error)
    return (
      <div className="narrow-page stack">
        <Feedback error={metadata.error} />
        <Button onClick={() => void metadata.refetch()}>
          Volver a intentar
        </Button>
      </div>
    );
  if (metadata.isPending) return <Loading label="Abriendo el enlace…" />;
  if (
    session.error instanceof ApiError &&
    session.error.code === "identity_required"
  )
    return (
      <ClaimIdentity
        token={token}
        metadata={metadata.data}
        onRefresh={() => metadata.refetch()}
        onClaimed={finishSession}
      />
    );
  if (session.error instanceof ApiError && session.error.status === 404)
    return <GroupUnavailable />;
  if (session.error)
    return (
      <div className="narrow-page stack">
        <Feedback error={session.error} />
        <Button onClick={() => start(metadata.data.id)}>
          Volver a intentar
        </Button>
      </div>
    );
  return <Loading label="Preparando tu acceso…" />;
}

function GroupSession({
  groupId,
  children,
}: {
  groupId: string;
  children: ReactNode;
}) {
  const query = useQuery({
    queryKey: groupKey(groupId),
    queryFn: () => api.group(groupId),
    retry: (count, error) =>
      !(
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) && count < 1,
  });
  if (query.error instanceof ApiError && query.error.status === 404)
    return <GroupUnavailable />;
  if (query.error instanceof ApiError && query.error.status === 403)
    return <SessionRequired />;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <div className="narrow-page stack">
        <Feedback error={query.error} />
        <Button onClick={() => void query.refetch()}>Volver a intentar</Button>
      </div>
    );
  return (
    <GroupContext.Provider value={{ groupId, group: query.data }}>
      {children}
    </GroupContext.Provider>
  );
}
