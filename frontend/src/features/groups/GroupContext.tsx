import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { Feedback, Loading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { ApiError, api, type Group } from "../../lib/api";
import { ClaimIdentity } from "./ClaimIdentity";

const GroupContext = createContext<{ token: string; group: Group } | null>(
  null,
);

export function useGroup() {
  const context = useContext(GroupContext);
  if (!context) throw new Error("Missing group context");
  return context;
}

export const groupKey = (token: string) => ["group", token] as const;
export const metadataKey = (token: string) => ["metadata", token] as const;

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

export function GroupBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  let token = "";
  try {
    token = decodeURIComponent(location.hash.slice(1));
  } catch {
    /* Malformed links use the unavailable screen. */
  }
  const query = useQuery({
    queryKey: groupKey(token),
    queryFn: () => api.group(token),
    enabled: !!token,
    retry: (count, error) =>
      !(
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) && count < 1,
  });
  if (!token) return <GroupUnavailable />;
  if (query.error instanceof ApiError && query.error.status === 404)
    return <GroupUnavailable />;
  if (
    query.error instanceof ApiError &&
    (query.error.code === "identity_required" ||
      query.error.code === "session_invalid")
  )
    return <ClaimIdentity token={token} />;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <div className="narrow-page stack">
        <Feedback error={query.error} />
        <Button onClick={() => void query.refetch()}>Volver a intentar</Button>
      </div>
    );
  return (
    <GroupContext.Provider value={{ token, group: query.data }}>
      {children}
    </GroupContext.Provider>
  );
}
