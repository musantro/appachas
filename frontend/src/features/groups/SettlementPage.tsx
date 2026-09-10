import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Share2, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, Feedback, PageHeading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { forgetEntryLinks } from "../../lib/access";
import { api, type Group } from "../../lib/api";
import { copyText, money, shareText } from "../../lib/format";
import { groupKey, useGroup } from "./GroupContext";
import { Balances, GroupTabs } from "./GroupPage";

export function SettlementPage() {
  const { group, groupId } = useGroup();
  const [closedGroup, setClosedGroup] = useState<Group>();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const close = useMutation({
    mutationFn: () => api.closeGroup(groupId, group.version),
    onSuccess: () => {
      setClosedGroup(group);
      setConfirm(false);
      forgetEntryLinks(groupId);
      void queryClient.cancelQueries({ queryKey: groupKey(groupId) });
    },
  });
  const snapshot = closedGroup ?? group;
  const names = Object.fromEntries(
    snapshot.members.map((member) => [member.id, member.alias]),
  );
  async function share(copy: boolean) {
    setMessage("");
    setError(undefined);
    setBusy(true);
    try {
      if (copy) {
        await copyText(snapshot.settlement_text);
        setMessage("Liquidación copiada.");
      } else {
        const result = await shareText(snapshot.settlement_text);
        if (result === "copied")
          setMessage("Liquidación copiada. Pégala en vuestro chat.");
      }
    } catch {
      setError(
        "No se pudo compartir o copiar. Selecciona el texto para copiarlo manualmente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={snapshot.name}
        title={closedGroup ? "Grupo cerrado" : "Dejamos las cuentas claras"}
        description={
          closedGroup
            ? "Los datos del grupo se han eliminado. Guarda este resumen antes de salir: solo estará visible en esta pantalla."
            : "Estos son los pagos pendientes para que todo quede saldado."
        }
      />
      {!closedGroup && <GroupTabs />}
      <div className="group-layout">
        <div className="stack">
          {closedGroup && (
            <div className="closed-banner">
              <Check size={24} aria-hidden="true" />
              <div>
                <h2>Todo listo por aquí</h2>
                <p>
                  Los enlaces ya no funcionan. Este resumen no se guarda en el
                  navegador.
                </p>
              </div>
            </div>
          )}
          <section className="card stack">
            <div className="section-heading mb-0">
              <h2>Pagos pendientes</h2>
              <Wallet size={20} aria-hidden="true" className="text-primary" />
            </div>
            {snapshot.payments.length ? (
              <>
                <ul className="stack-small" aria-label="Pagos de liquidación">
                  {snapshot.payments.map((payment) => (
                    <li
                      key={`${payment.from_member_id}-${payment.to_member_id}`}
                      className="payment-row"
                    >
                      <ArrowRight size={20} aria-hidden="true" />
                      <p>
                        <strong>{names[payment.from_member_id]}</strong> paga{" "}
                        <strong>{money(payment.amount_cents)}</strong> a{" "}
                        <strong>{names[payment.to_member_id]}</strong>
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="link-actions">
                  <Button onClick={() => void share(true)} disabled={busy}>
                    <Copy size={17} aria-hidden="true" />
                    Copiar texto
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void share(false)}
                    disabled={busy}
                  >
                    <Share2 size={17} aria-hidden="true" />
                    Compartir
                  </Button>
                </div>
                <details>
                  <summary className="back-link cursor-pointer">
                    Ver texto para copiar
                  </summary>
                  <p className="copy-preview">{snapshot.settlement_text}</p>
                </details>
              </>
            ) : (
              <div className="empty-state">
                <div className="share-icon">
                  <Check size={28} aria-hidden="true" />
                </div>
                <h2>Todo está saldado</h2>
                <p>No quedan pagos pendientes entre los integrantes.</p>
              </div>
            )}
            <Feedback success={message} error={error} />
          </section>
          {snapshot.role === "creator" && !closedGroup && (
            <section className="card danger-zone mt-0">
              <h2 className="text-base">¿Habéis terminado?</h2>
              <p className="muted">
                Cerrar el grupo elimina sus datos y desactiva ambos enlaces.
                Podrás copiar el resumen en esta pantalla antes de salir.
              </p>
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                Cerrar grupo
              </Button>
            </section>
          )}
          {closedGroup && (
            <Button asChild variant="outline">
              <Link
                to="/"
                onClick={() =>
                  queryClient.removeQueries({ queryKey: groupKey(groupId) })
                }
              >
                Crear un nuevo grupo
              </Link>
            </Button>
          )}
        </div>
        <aside className="stack">
          <section className="card">
            <h2 className="text-base mb-4">Balance de cada persona</h2>
            <Balances group={snapshot} />
          </section>
          {closedGroup && (
            <div className="info-card">
              <p className="muted">
                {snapshot.total_cents < 0 ? "Reembolsos netos" : "Gasto total"}
              </p>
              <p className="amount-total">
                {money(Math.abs(snapshot.total_cents))}
              </p>
              <p className="muted">
                {snapshot.movements.length} movimientos registrados
              </p>
            </div>
          )}
        </aside>
      </div>
      {closedGroup && snapshot.movements.length > 0 && (
        <section className="card mt-6 stack-small">
          <h2 className="text-base">Resumen de movimientos</h2>
          <ul className="stack-small">
            {snapshot.movements.map((movement) => (
              <li className="split-summary" key={movement.id}>
                <span>
                  {movement.concept || "Aportación"} ·{" "}
                  {names[movement.payer_id]} · {movement.date}
                  <span className="block muted">
                    {movement.type === "expense"
                      ? "Gasto"
                      : movement.type === "refund"
                        ? "Reembolso"
                        : "Aportación"}{" "}
                    ·{" "}
                    {movement.allocations
                      .map(
                        (allocation) =>
                          `${names[allocation.member_id]}: ${money(allocation.amount_cents)}`,
                      )
                      .join(", ")}
                  </span>
                </span>
                <strong>{money(movement.amount_cents)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={confirm}
        title="¿Cerrar y eliminar el grupo?"
        description="Esta acción es irreversible. Se eliminarán todos los integrantes y movimientos; los enlaces dejarán de funcionar. El resumen seguirá visible en esta pantalla hasta que salgas."
        action="Cerrar y eliminar"
        busy={close.isPending}
        onConfirm={() => close.mutate()}
        onCancel={() => setConfirm(false)}
        error={close.error}
      />
    </>
  );
}
