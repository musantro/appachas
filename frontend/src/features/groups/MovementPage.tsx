import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ConfirmDialog,
  Feedback,
  Field,
  PageHeading,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import {
  ApiError,
  api,
  type Movement,
  type MovementInput,
} from "../../lib/api";
import {
  amountInput,
  equalAmounts,
  groupPath,
  money,
  parseAmount,
} from "../../lib/format";
import { groupKey, useGroup } from "./GroupContext";

const movementLabels = {
  expense: "Gasto",
  refund: "Reembolso",
  contribution: "Aportación",
} as const;

export function MovementPage() {
  const { movementId } = useParams();
  const { group, groupId } = useGroup();
  const queryClient = useQueryClient();
  const [refresh, setRefresh] = useState(0);
  const movement = group.movements.find((item) => item.id === movementId);
  if (movementId && !movement)
    return (
      <div className="narrow-page stack">
        <PageHeading
          title="Movimiento no disponible"
          back={groupPath(groupId)}
        />
        <p className="muted">
          Otra persona puede haberlo eliminado. Vuelve al grupo para consultar
          los movimientos actuales.
        </p>
      </div>
    );
  return (
    <MovementEditor
      key={`${movementId ?? "new"}:${refresh}`}
      movement={movement}
      onReload={async () => {
        await queryClient.invalidateQueries({ queryKey: groupKey(groupId) });
        setRefresh((value) => value + 1);
      }}
    />
  );
}

function MovementEditor({
  movement,
  onReload,
}: {
  movement?: Movement;
  onReload: () => Promise<void>;
}) {
  const { groupId, group } = useGroup();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState<MovementInput["type"]>(
    movement?.type ?? "expense",
  );
  const [amount, setAmount] = useState(
    movement ? amountInput(movement.amount_cents) : "",
  );
  const [concept, setConcept] = useState(movement?.concept ?? "");
  const [date, setDate] = useState(
    movement?.date ??
      (group.today < group.end_date ? group.today : group.end_date),
  );
  const [payer, setPayer] = useState(movement?.payer_id ?? group.my_member_id);
  const [participants, setParticipants] = useState<string[]>(
    movement?.allocations.map((item) => item.member_id) ??
      group.members.map((member) => member.id),
  );
  const [allocations, setAllocations] = useState<Record<string, string>>(
    Object.fromEntries(
      movement?.allocations.map((item) => [
        item.member_id,
        amountInput(item.amount_cents),
      ]) ?? [],
    ),
  );
  const [version] = useState(movement?.version);
  const [validation, setValidation] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const total = parseAmount(amount);
  const allocated = participants.reduce(
    (sum, id) => sum + (parseAmount(allocations[id] ?? "") ?? 0),
    0,
  );
  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: groupKey(groupId) });
    navigate(groupPath(groupId));
  };
  const save = useMutation({
    mutationFn: (input: MovementInput) =>
      movement
        ? api.updateMovement(groupId, movement.id, {
            ...input,
            version: version ?? movement.version,
          })
        : api.createMovement(groupId, input),
    onSuccess: finish,
  });
  const remove = useMutation({
    mutationFn: () =>
      api.deleteMovement(groupId, movement?.id ?? "", version ?? 0),
    onSuccess: finish,
  });
  const conflictError = save.error ?? remove.error;
  const conflict =
    conflictError instanceof ApiError && conflictError.code === "stale_version";
  const busy = save.isPending || remove.isPending;

  function selectType(next: MovementInput["type"]) {
    if (next === "contribution" && type !== "contribution") {
      setParticipants([]);
      setAllocations({});
    }
    if (next !== "contribution" && type === "contribution")
      setParticipants(group.members.map((member) => member.id));
    setType(next);
  }
  function redistribute(ids: string[], nextAmount = amount) {
    const ordered = group.members
      .filter((member) => ids.includes(member.id))
      .map((member) => member.id);
    setAllocations(equalAmounts(parseAmount(nextAmount) ?? 0, ordered));
  }
  function toggleParticipant(id: string) {
    const next = participants.includes(id)
      ? participants.filter((item) => item !== id)
      : [...participants, id];
    setParticipants(next);
    if (type === "contribution") redistribute(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    if (!total)
      return setValidation(
        "Introduce un importe positivo de al menos 0,01 €, con un máximo de dos decimales.",
      );
    if (type !== "contribution" && !concept.trim())
      return setValidation("Escribe un concepto para el movimiento.");
    if (!participants.length)
      return setValidation(
        type === "contribution"
          ? "Selecciona al menos un receptor."
          : "Selecciona al menos un participante.",
      );
    if (
      type === "contribution" &&
      (allocated !== total ||
        participants.some(
          (id) => parseAmount(allocations[id] ?? "", true) === null,
        ))
    )
      return setValidation(
        "Los importes de los receptores deben sumar exactamente el total y no pueden ser negativos.",
      );
    if (date > group.today || date > group.end_date)
      return setValidation(
        "La fecha no puede ser futura ni posterior al fin del grupo.",
      );
    save.mutate({
      type,
      amount,
      concept: concept.trim(),
      date,
      payer_id: payer,
      participant_ids: type === "contribution" ? [] : participants,
      ...(type === "contribution"
        ? {
            allocations: participants.map((id) => ({
              member_id: id,
              amount: allocations[id],
            })),
          }
        : {}),
      ...(version === undefined ? {} : { version }),
    });
  }

  return (
    <div className="narrow-page">
      <PageHeading
        title={movement ? "Editar movimiento" : "Añadir movimiento"}
        description="Apúntalo ahora. Las cuentas se actualizan para todos."
        back={groupPath(groupId)}
      />
      <form className="card stack" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>Tipo de movimiento</legend>
          <div className="type-selector">
            {(["expense", "refund", "contribution"] as const).map((value) => (
              <label className="type-option" key={value}>
                <input
                  type="radio"
                  name="movement-type"
                  value={value}
                  checked={type === value}
                  onChange={() => selectType(value)}
                  disabled={
                    !!movement &&
                    (movement.type === "contribution") !==
                      (value === "contribution")
                  }
                />
                {movementLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <Field
            id="movement-amount"
            label="Importe total"
            hint="En euros, con coma o punto decimal."
          >
            <input
              id="movement-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (type === "contribution")
                  redistribute(participants, event.target.value);
              }}
              required
              placeholder="0,00"
              autoComplete="off"
            />
          </Field>
          <Field
            id="movement-date"
            label="Fecha"
            hint="También puedes anotar pagos previos al viaje."
          >
            <input
              id="movement-date"
              type="date"
              required
              value={date}
              max={group.today < group.end_date ? group.today : group.end_date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>
        <Field
          id="movement-concept"
          label={type === "contribution" ? "Concepto (opcional)" : "Concepto"}
        >
          <input
            id="movement-concept"
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
            required={type !== "contribution"}
            placeholder={
              type === "contribution"
                ? "Ej. Mi parte de la casa"
                : "Ej. Cena del viernes"
            }
          />
        </Field>
        <Field
          id="movement-payer"
          label={type === "contribution" ? "Origen" : "Pagador"}
        >
          <select
            id="movement-payer"
            value={payer}
            onChange={(event) => {
              const nextPayer = event.target.value;
              setPayer(nextPayer);
              if (type === "contribution") {
                const next = participants.filter((id) => id !== nextPayer);
                setParticipants(next);
                redistribute(next);
              }
            }}
          >
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.alias}
              </option>
            ))}
          </select>
        </Field>
        <div className="section-divider" />
        <fieldset>
          <legend>
            {type === "contribution"
              ? "¿Quién recibe la aportación?"
              : "¿Entre quiénes lo repartimos?"}
          </legend>
          <div className="member-selector">
            {group.members
              .filter(
                (member) => type !== "contribution" || member.id !== payer,
              )
              .map((member) => (
                <div key={member.id} className="allocation-row">
                  <label className="member-option">
                    <input
                      type="checkbox"
                      checked={participants.includes(member.id)}
                      onChange={() => toggleParticipant(member.id)}
                    />
                    <span className="member-label">{member.alias}</span>
                    {type !== "contribution" &&
                      participants.includes(member.id) && (
                        <Check
                          size={16}
                          aria-hidden="true"
                          className="text-primary"
                        />
                      )}
                  </label>
                  {type === "contribution" &&
                    participants.includes(member.id) && (
                      <div className="allocation-input">
                        <label
                          className="sr-only"
                          htmlFor={`allocation-${member.id}`}
                        >
                          Importe para {member.alias}
                        </label>
                        <input
                          id={`allocation-${member.id}`}
                          inputMode="decimal"
                          value={allocations[member.id] ?? ""}
                          onChange={(event) =>
                            setAllocations({
                              ...allocations,
                              [member.id]: event.target.value,
                            })
                          }
                          required
                        />
                      </div>
                    )}
                </div>
              ))}
          </div>
        </fieldset>
        {type === "contribution" ? (
          <>
            <div className="split-summary">
              <span>Repartido</span>
              <strong>
                {money(allocated)} / {money(total ?? 0)}
              </strong>
            </div>
            <p className="field-hint">
              Se reparte por igual al seleccionar receptores. Puedes ajustar
              cada importe; la suma debe coincidir con el total.
            </p>
          </>
        ) : (
          <div className="info-inline">
            <Info size={18} aria-hidden="true" />
            <p>
              {type === "refund"
                ? "Introduce la devolución en positivo. Se restará del gasto total y se repartirá por igual."
                : "El importe se reparte a partes iguales. Los céntimos sobrantes siguen el orden de alta."}
            </p>
          </div>
        )}
        <Feedback error={validation || save.error} />
        {conflict && (
          <div className="stack-small">
            <p className="muted">
              Tu formulario se conserva. Otra persona ha cambiado este
              movimiento; carga su versión antes de volver a editarlo.
            </p>
            <Button
              variant="outline"
              type="button"
              onClick={() => void onReload()}
            >
              Cargar versión actual
            </Button>
          </div>
        )}
        <div className="form-actions">
          <Button asChild variant="ghost">
            <Link to={groupPath(groupId)}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={busy || conflict}>
            {save.isPending ? "Guardando…" : "Guardar movimiento"}
          </Button>
        </div>
      </form>
      {movement && (
        <Button
          variant="destructive"
          className="mt-6"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={17} aria-hidden="true" />
          Eliminar movimiento
        </Button>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar este movimiento?"
        description="Se eliminará para todo el grupo y las cuentas se recalcularán. Esta acción no se puede deshacer."
        action="Eliminar movimiento"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        error={remove.error}
      />
    </div>
  );
}
