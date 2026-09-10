import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Settings, UserRound, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  ConfirmDialog,
  Feedback,
  Field,
  PageHeading,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import { ApiError, api, type Member } from "../../lib/api";
import { groupPath } from "../../lib/format";
import { groupKey, useGroup } from "./GroupContext";
import { GroupTabs } from "./GroupPage";

export function OptionsPage() {
  const { group } = useGroup();
  const me = group.members.find((member) => member.id === group.my_member_id);
  return (
    <>
      <PageHeading
        eyebrow={group.name}
        title="Opciones del grupo"
        description="Tu identidad y los detalles del plan, en un mismo sitio."
      />
      <GroupTabs />
      <div className="group-layout">
        <div className="stack">
          {me && <IdentityOptions key={`${me.id}:${me.version}`} member={me} />}
          {group.role === "creator" && <GroupSettings key={group.version} />}
        </div>
        <aside className="stack">
          {group.role === "creator" ? (
            <MemberManagement />
          ) : (
            <div className="info-card">
              <h2 className="text-base mb-2">Un grupo, entre todos</h2>
              <p className="muted">
                Puedes crear, editar y eliminar cualquier movimiento. La persona
                creadora administra los integrantes, las fechas y el cierre del
                grupo.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function IdentityOptions({ member }: { member: Member }) {
  const { group, token } = useGroup();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [alias, setAlias] = useState(member.alias);
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState("");
  const rename = useMutation({
    mutationFn: () => api.renameMember(token, member, alias.trim()),
    onSuccess: async () => {
      setMessage("Tu alias se ha actualizado para todo el grupo.");
      await queryClient.invalidateQueries({ queryKey: groupKey(token) });
    },
  });
  const switchIdentity = useMutation({
    mutationFn: () => api.claim(token, { member_id: target }),
    onSuccess: (result) => {
      queryClient.setQueryData(groupKey(token), result.group);
      navigate(groupPath(token));
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === "member_already_claimed"
      ) {
        setTarget("");
        void queryClient.invalidateQueries({ queryKey: groupKey(token) });
      }
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    if (!alias.trim()) {
      setValidation("El alias no puede estar vacío.");
      return;
    }
    rename.mutate();
  }
  const available = group.members.filter(
    (item) => !item.claimed && item.id !== member.id,
  );
  return (
    <section className="card stack">
      <div className="card-title mb-0">
        <UserRound size={21} aria-hidden="true" />
        <h2 className="text-base">Tu identidad</h2>
        {group.role === "creator" && <span className="badge">Creador</span>}
      </div>
      <form className="stack-small" onSubmit={submit}>
        <Field
          id="own-alias"
          label="Tu alias"
          hint="Este nombre lo ve todo el grupo, también en los movimientos anteriores."
        >
          <input
            id="own-alias"
            required
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            autoComplete="nickname"
          />
        </Field>
        <Feedback error={validation || rename.error} success={message} />
        <Button variant="outline" type="submit" disabled={rename.isPending}>
          {rename.isPending ? "Guardando…" : "Guardar alias"}
        </Button>
      </form>
      {group.role !== "creator" && (
        <>
          <div className="section-divider" />
          <form
            className="stack-small"
            onSubmit={(event) => {
              event.preventDefault();
              if (target) switchIdentity.mutate();
            }}
          >
            <Field
              id="switch-identity"
              label="Cambiar identidad"
              hint="Al cambiar, tu identidad actual quedará libre."
            >
              <select
                id="switch-identity"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                disabled={!available.length}
                required
              >
                <option value="">
                  {available.length
                    ? "Elige una identidad disponible"
                    : "No hay identidades disponibles"}
                </option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.alias}
                  </option>
                ))}
              </select>
            </Field>
            <Feedback error={switchIdentity.error} />
            <Button
              variant="outline"
              type="submit"
              disabled={!target || switchIdentity.isPending}
            >
              {switchIdentity.isPending ? "Cambiando…" : "Cambiar identidad"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

function GroupSettings() {
  const { group, token } = useGroup();
  const queryClient = useQueryClient();
  const [name, setName] = useState(group.name);
  const [start, setStart] = useState(group.start_date);
  const [end, setEnd] = useState(group.end_date);
  const [validation, setValidation] = useState("");
  const reachedEnd = group.today >= group.end_date;
  const save = useMutation({
    mutationFn: () =>
      api.updateGroup(token, {
        name: name.trim(),
        start_date: start,
        end_date: end,
        version: group.version,
      }),
    onSuccess: (result) => queryClient.setQueryData(groupKey(token), result),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    if (!name.trim())
      return setValidation("El nombre del grupo no puede estar vacío.");
    if (start > end)
      return setValidation(
        "La fecha de fin no puede ser anterior a la de inicio.",
      );
    save.mutate();
  }
  return (
    <section className="card stack">
      <div className="card-title mb-0">
        <Settings size={21} aria-hidden="true" />
        <h2 className="text-base">Detalles del grupo</h2>
      </div>
      <form className="stack" onSubmit={submit}>
        <Field id="settings-name" label="Nombre del grupo">
          <input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <div className="form-grid">
          <Field id="settings-start" label="Fecha de inicio">
            <input
              id="settings-start"
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
              disabled={reachedEnd}
            />
          </Field>
          <Field id="settings-end" label="Fecha de fin">
            <input
              id="settings-end"
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              required
              disabled={reachedEnd}
            />
          </Field>
        </div>
        <p className="field-hint">
          {reachedEnd
            ? "La fecha final ya ha llegado; el rango del grupo no se puede modificar."
            : "El nuevo rango debe incluir los movimientos existentes. Las fechas se interpretan en la zona horaria del creador."}
        </p>
        <Feedback error={validation || save.error} />
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Guardando…" : "Guardar grupo"}
        </Button>
      </form>
    </section>
  );
}

function MemberManagement() {
  const { group, token } = useGroup();
  const queryClient = useQueryClient();
  const [alias, setAlias] = useState("");
  const [validation, setValidation] = useState("");
  const add = useMutation({
    mutationFn: () => api.addMember(token, alias.trim()),
    onSuccess: async () => {
      setAlias("");
      await queryClient.invalidateQueries({ queryKey: groupKey(token) });
    },
  });
  return (
    <section className="card stack">
      <div className="card-title mb-0">
        <Users size={21} aria-hidden="true" />
        <h2 className="text-base">Integrantes · {group.members.length}</h2>
      </div>
      <ul className="stack-small">
        {group.members.map((member) => (
          <li key={member.id}>
            <MemberEditor
              key={`${member.id}:${member.version}`}
              member={member}
            />
          </li>
        ))}
      </ul>
      <form
        className="stack-small"
        onSubmit={(event) => {
          event.preventDefault();
          setValidation("");
          if (!alias.trim()) {
            setValidation("Escribe el nombre del nuevo integrante.");
            return;
          }
          add.mutate();
        }}
      >
        <Field
          id="new-member"
          label="Nuevo integrante"
          hint="Empieza con saldo cero. No cambia los movimientos anteriores."
        >
          <input
            id="new-member"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            required
            disabled={group.members.length >= 50}
          />
        </Field>
        <Feedback error={validation || add.error} />
        <Button
          variant="outline"
          type="submit"
          disabled={add.isPending || group.members.length >= 50}
        >
          <Plus size={16} aria-hidden="true" />
          {add.isPending ? "Añadiendo…" : "Añadir integrante"}
        </Button>
      </form>
    </section>
  );
}

function MemberEditor({ member }: { member: Member }) {
  const { token } = useGroup();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(member.alias);
  const [confirmation, setConfirmation] = useState<"remove" | "release" | null>(
    null,
  );
  const rename = useMutation({
    mutationFn: () => api.renameMember(token, member, alias.trim()),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: groupKey(token) });
    },
  });
  const action = useMutation({
    mutationFn: async () => {
      if (confirmation === "remove") await api.removeMember(token, member);
      else await api.releaseMember(token, member);
    },
    onSuccess: async () => {
      setConfirmation(null);
      await queryClient.invalidateQueries({ queryKey: groupKey(token) });
    },
  });
  return (
    <div className="management-row">
      <div className="management-header">
        <Avatar alias={member.alias} small />
        <div>
          <h3>{member.alias}</h3>
          <p className="field-hint">
            {member.is_creator
              ? "Creador"
              : member.claimed
                ? "Identidad ocupada"
                : "Identidad disponible"}
          </p>
        </div>
        <Button
          variant="ghost"
          className="icon-button"
          aria-label={`Renombrar ${member.alias}`}
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={16} />
        </Button>
      </div>
      {editing && (
        <form
          className="stack-small"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <Field id={`rename-${member.id}`} label={`Alias de ${member.alias}`}>
            <input
              id={`rename-${member.id}`}
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              required
            />
          </Field>
          <Feedback error={rename.error} />
          <div className="management-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
            <Button variant="outline" type="submit" disabled={rename.isPending}>
              Guardar nombre
            </Button>
          </div>
        </form>
      )}
      {!member.is_creator && (
        <div className="management-actions">
          {member.claimed && (
            <Button
              variant="outline"
              aria-label={`Liberar identidad de ${member.alias}`}
              onClick={() => {
                action.reset();
                setConfirmation("release");
              }}
            >
              Liberar identidad
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-error"
            aria-label={`Eliminar ${member.alias}`}
            onClick={() => {
              action.reset();
              setConfirmation("remove");
            }}
          >
            Eliminar
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmation}
        title={
          confirmation === "remove"
            ? `¿Eliminar a ${member.alias}?`
            : `¿Liberar a ${member.alias}?`
        }
        description={
          confirmation === "remove"
            ? "Se eliminará este integrante y se liberará su identidad. Solo es posible si no aparece en ningún movimiento y quedan al menos dos integrantes."
            : "Su navegador perderá el acceso. El integrante podrá reclamar de nuevo su identidad desde el enlace común."
        }
        action={
          confirmation === "remove"
            ? "Eliminar integrante"
            : "Liberar identidad"
        }
        busy={action.isPending}
        onConfirm={() => action.mutate()}
        onCancel={() => setConfirmation(null)}
        error={action.error}
      />
    </div>
  );
}
