import type { Group } from "./api";
import { money } from "./format";

export function groupSummary(group: Group): string {
  const names = Object.fromEntries(
    group.members.map((member) => [member.id, member.alias]),
  );
  return [
    `Appachas · ${group.name}`,
    `Fechas: ${group.start_date} — ${group.end_date} (${group.timezone})`,
    `Gasto total neto: ${money(group.total_cents)}`,
    "",
    "Integrantes",
    ...group.members.map((member) => `- ${member.alias}`),
    "",
    `Movimientos (${group.movements.length})`,
    ...(group.movements.length
      ? group.movements.flatMap((movement) => [
          `- ${movement.date} · ${movement.type === "expense" ? "Gasto" : movement.type === "refund" ? "Reembolso" : "Aportación"} · ${money(movement.amount_cents)}`,
          ...(movement.concept ? [`  Concepto: ${movement.concept}`] : []),
          `  ${movement.type === "refund" ? "Recibido por" : "Pagado por"}: ${names[movement.payer_id]}`,
          `  ${movement.type === "contribution" ? "Destinatarios" : "Reparto"}: ${movement.allocations.map((allocation) => `${names[allocation.member_id]}: ${money(allocation.amount_cents)}`).join("; ")}`,
        ])
      : ["Todavía no hay movimientos."]),
    "",
    "Balances",
    ...group.balances.map(
      (balance) =>
        `- ${names[balance.member_id]}: ${balance.amount_cents > 0 ? "recibe" : balance.amount_cents < 0 ? "debe" : "saldado"} ${money(Math.abs(balance.amount_cents))}`,
    ),
    "",
    "Pagos pendientes",
    ...(group.payments.length
      ? group.payments.map(
          (payment) =>
            `- ${names[payment.from_member_id]} paga ${money(payment.amount_cents)} a ${names[payment.to_member_id]}`,
        )
      : ["No hay pagos pendientes."]),
    "",
    "Este resumen refleja los movimientos registrados. Appachas no realiza pagos; cerrar el grupo no salda las deudas.",
    "",
  ].join("\n");
}

export function downloadGroupSummary(group: Group): void {
  const url = URL.createObjectURL(
    new Blob([groupSummary(group)], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "appachas-resumen.txt";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
