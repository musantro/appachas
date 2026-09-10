import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleHelp,
  Link2,
  Plus,
  ReceiptText,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Feedback, Field } from "../../components/common";
import { Button } from "../../components/ui/button";
import { rememberEntryLinks } from "../../lib/access";
import { api } from "../../lib/api";
import { entryPath, groupPath, localDate } from "../../lib/format";
import { groupKey } from "../groups/GroupContext";

export function CreateGroup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [start, setStart] = useState(localDate());
  const [end, setEnd] = useState(localDate(1));
  const [members, setMembers] = useState([
    { key: "first", alias: "" },
    { key: "second", alias: "" },
  ]);
  const [creator, setCreator] = useState("first");
  const [validation, setValidation] = useState("");
  const create = useMutation({
    mutationFn: api.createGroup,
    onSuccess: (result) => {
      rememberEntryLinks(result.group.id, {
        memberUrl: `${window.location.origin}${entryPath(result.member_token)}`,
        creatorUrl: `${window.location.origin}${entryPath(result.creator_token)}`,
      });
      queryClient.setQueryData(groupKey(result.group.id), result.group);
      navigate(groupPath(result.group.id, "/share"));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    const aliases = members.map((member) => member.alias.trim());
    if (!name.trim()) return setValidation("Escribe un nombre para el grupo.");
    if (aliases.some((alias) => !alias))
      return setValidation("Todos los integrantes necesitan un nombre.");
    if (
      new Set(aliases.map((alias) => alias.toLocaleLowerCase())).size !==
      aliases.length
    )
      return setValidation(
        "Los nombres de los integrantes deben ser diferentes.",
      );
    if (start < localDate() || end <= localDate() || start > end)
      return setValidation(
        "El inicio debe ser desde hoy y el fin desde mañana, sin ser anterior al inicio.",
      );
    create.mutate({
      name: name.trim(),
      start_date: start,
      end_date: end,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      members: aliases,
      creator_index: members.findIndex((member) => member.key === creator),
    });
  }

  return (
    <div className="create-layout">
      <section className="intro">
        <span className="badge">
          <Check size={14} aria-hidden="true" /> Sin registro. Sin
          complicaciones.
        </span>
        <h1>
          Buenos planes.
          <br />
          <span>Cuentas claras.</span>
        </h1>
        <p className="intro-description">
          El viaje, la cena, ese regalo entre todos. Compartid los gastos y
          disfrutad del plan.
        </p>
        <ol className="intro-steps">
          <li className="intro-step">
            <span className="step-icon">
              <Users size={22} aria-hidden="true" />
            </span>
            <div>
              <h3>Un grupo para vuestro plan</h3>
              <p>Solo un nombre, las fechas y quiénes vais.</p>
            </div>
          </li>
          <li className="intro-step">
            <span className="step-icon">
              <Link2 size={22} aria-hidden="true" />
            </span>
            <div>
              <h3>Un enlace para compartir</h3>
              <p>Cada persona elige quién es y se une.</p>
            </div>
          </li>
          <li className="intro-step">
            <span className="step-icon">
              <ReceiptText size={22} aria-hidden="true" />
            </span>
            <div>
              <h3>Todo cuadra, hasta el último céntimo</h3>
              <p>Apuntad los gastos. Appachas hace las cuentas.</p>
            </div>
          </li>
        </ol>
        <div className="info-inline">
          <CircleHelp size={18} aria-hidden="true" />
          <p>
            Sin cuentas ni instalaciones. Solo cookies necesarias para recordar
            tu identidad.
          </p>
        </div>
      </section>
      <section className="card create-card" aria-labelledby="create-title">
        <h2 id="create-title">Empecemos el plan</h2>
        <p className="muted">Crea vuestro grupo en un momento.</p>
        <form className="stack" onSubmit={submit}>
          <Field id="group-name" label="Nombre del grupo">
            <input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Ej. Escapada a Lisboa"
              autoComplete="off"
            />
          </Field>
          <div className="form-grid">
            <Field id="start-date" label="Fecha de inicio">
              <input
                id="start-date"
                type="date"
                value={start}
                min={localDate()}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </Field>
            <Field id="end-date" label="Fecha de fin">
              <input
                id="end-date"
                type="date"
                value={end}
                min={start > localDate(1) ? start : localDate(1)}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </Field>
          </div>
          <div className="section-divider" />
          <fieldset className="stack-small">
            <legend>
              <Users size={16} aria-hidden="true" className="inline mr-2" />{" "}
              ¿Quiénes os apuntáis?
            </legend>
            {members.map((member, index) => (
              <div className="member-input-row" key={member.key}>
                <Field
                  id={`member-${member.key}`}
                  label={`Integrante ${index + 1}`}
                >
                  <input
                    id={`member-${member.key}`}
                    value={member.alias}
                    onChange={(event) =>
                      setMembers(
                        members.map((item) =>
                          item.key === member.key
                            ? { ...item, alias: event.target.value }
                            : item,
                        ),
                      )
                    }
                    required
                    autoComplete="off"
                    placeholder={
                      index === 0 ? "Tu nombre" : "Nombre del integrante"
                    }
                  />
                </Field>
                {members.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="icon-button"
                    aria-label={`Quitar integrante ${index + 1}`}
                    onClick={() => {
                      setMembers(
                        members.filter((item) => item.key !== member.key),
                      );
                      if (creator === member.key)
                        setCreator(
                          members[0].key === member.key
                            ? members[1].key
                            : members[0].key,
                        );
                    }}
                  >
                    <X size={18} />
                  </Button>
                )}
              </div>
            ))}
            {members.length < 50 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setMembers([
                    ...members,
                    { key: crypto.randomUUID(), alias: "" },
                  ])
                }
              >
                <Plus size={16} aria-hidden="true" /> Añadir integrante
              </Button>
            )}
          </fieldset>
          <Field
            id="creator"
            label="¿Quién eres tú?"
            hint="Serás la persona creadora y podrás administrar el grupo."
          >
            <select
              id="creator"
              value={creator}
              onChange={(event) => setCreator(event.target.value)}
            >
              {members.map((member, index) => (
                <option key={member.key} value={member.key}>
                  {member.alias.trim() || `Integrante ${index + 1}`}
                </option>
              ))}
            </select>
          </Field>
          <div className="info-inline">
            <CalendarDays size={18} aria-hidden="true" />
            <p>
              Los datos se eliminan automáticamente después del viaje. También
              podrás cerrar el grupo cuando acabéis.
            </p>
          </div>
          <Feedback error={validation || create.error} />
          <Button
            type="submit"
            disabled={create.isPending}
            className="full-width"
          >
            {create.isPending ? "Creando el grupo…" : "Crear grupo"}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
          <p className="fine-print">
            Gratis, de código abierto y sin publicidad.
          </p>
        </form>
      </section>
    </div>
  );
}
