import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Feedback,
  Field,
  Loading,
  PageHeading,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import { ApiError, api } from "../../lib/api";
import { dateRange, groupPath } from "../../lib/format";
import { GroupUnavailable, groupKey, metadataKey } from "./GroupContext";

export function ClaimIdentity({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState("");
  const [alias, setAlias] = useState("");
  const metadata = useQuery({
    queryKey: metadataKey(token),
    queryFn: () => api.metadata(token),
    retry: false,
  });
  const claim = useMutation({
    mutationFn: () =>
      api.claim(token, {
        member_id: memberId,
        ...(alias.trim() ? { alias: alias.trim() } : {}),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(groupKey(token), result.group);
      navigate(groupPath(token));
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === "member_already_claimed"
      ) {
        setMemberId("");
        void metadata.refetch();
      }
    },
  });
  if (metadata.error instanceof ApiError && metadata.error.status === 404)
    return <GroupUnavailable />;
  if (metadata.isPending) return <Loading />;
  if (metadata.error)
    return (
      <div className="narrow-page stack">
        <Feedback error={metadata.error} />
        <Button onClick={() => void metadata.refetch()}>
          Volver a intentar
        </Button>
      </div>
    );
  const group = metadata.data;
  const available = group.members.filter((member) => !member.claimed);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (memberId) claim.mutate();
  }
  return (
    <div className="narrow-page">
      <PageHeading
        eyebrow="Te han guardado un sitio"
        title={group.name}
        description={`${dateRange(group.start_date, group.end_date)} · ${group.members.length} integrantes`}
      />
      <form className="card stack" onSubmit={submit}>
        <div>
          <h2>¿Quién eres?</h2>
          <p className="muted mt-2">
            Elige tu nombre para entrar al grupo. Tu identidad quedará guardada
            en este navegador.
          </p>
        </div>
        <fieldset>
          <legend>Integrantes del grupo</legend>
          <div className="member-selector">
            {group.members.map((member) => (
              <label key={member.id} className="member-option">
                <input
                  type="radio"
                  name="identity"
                  value={member.id}
                  checked={memberId === member.id}
                  disabled={member.claimed}
                  onChange={() => {
                    setMemberId(member.id);
                    claim.reset();
                  }}
                />
                <Avatar alias={member.alias} />
                <span className="member-label">
                  {member.alias}
                  <span className="caption">
                    {member.claimed ? "Ocupado" : "Disponible"}
                    {member.is_creator ? " · Creador" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {available.length > 0 ? (
          <>
            <Field
              id="claim-alias"
              label="Tu alias (opcional)"
              hint="Si lo cambias, todo el grupo verá este nombre."
            >
              <input
                id="claim-alias"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                placeholder="Puedes mantener el nombre actual"
                autoComplete="nickname"
              />
            </Field>
            <Feedback error={claim.error} />
            <Button type="submit" disabled={!memberId || claim.isPending}>
              {claim.isPending
                ? "Guardando tu identidad…"
                : "Confirmar identidad"}
            </Button>
          </>
        ) : (
          <div className="info-card info-inline">
            <Users size={18} aria-hidden="true" />
            <p>
              Todas las identidades están ocupadas. Pide al creador que libere
              la tuya para poder entrar.
            </p>
          </div>
        )}
        <div className="info-inline">
          <Info size={18} aria-hidden="true" />
          <p>
            El enlace permite acceder al grupo, pero no verifica quién eres.
            Elige solo tu identidad. Si borras los datos del navegador, el
            creador tendrá que liberarla.
          </p>
        </div>
      </form>
    </div>
  );
}
