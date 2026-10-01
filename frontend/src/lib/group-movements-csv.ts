import type { Group, Movement } from "./api";

const BOM = "\uFEFF";
const CURRENCY = "EUR";
const HEADERS = [
  "id_movimiento",
  "fecha",
  "tipo",
  "concepto",
  "pagador",
  "destinatario",
  "importe_asignado",
  "moneda",
];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareMovements(left: Movement, right: Movement): number {
  return (
    compareText(left.date, right.date) ||
    compareText(left.created_at, right.created_at) ||
    compareText(left.id, right.id)
  );
}

function textCell(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const safe = /^\s*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replaceAll('"', '""')}"`;
}

function decimalAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

function movementType(type: Movement["type"]): "gasto" | "liquidacion" {
  return type === "contribution" ? "liquidacion" : "gasto";
}

export function groupMovementsCsv(group: Group): string {
  const members = new Map(group.members.map((member) => [member.id, member]));
  const rows = [...group.movements]
    .sort(compareMovements)
    .flatMap((movement) => {
      const payer = members.get(movement.payer_id);
      if (!payer) throw new Error("Movement payer is not part of the group");

      const allocatedCents = movement.allocations.reduce(
        (total, allocation) => total + allocation.amount_cents,
        0,
      );
      if (allocatedCents !== movement.amount_cents) {
        throw new Error("Movement allocations do not match its total");
      }

      return [...movement.allocations]
        .sort((left, right) => {
          const leftMember = members.get(left.member_id);
          const rightMember = members.get(right.member_id);
          if (!leftMember || !rightMember)
            return compareText(left.member_id, right.member_id);
          return (
            leftMember.position - rightMember.position ||
            compareText(left.member_id, right.member_id)
          );
        })
        .map((allocation) => {
          const recipient = members.get(allocation.member_id);
          if (!recipient) {
            throw new Error("Movement recipient is not part of the group");
          }
          return [
            textCell(movement.id),
            textCell(movement.date),
            textCell(movementType(movement.type)),
            textCell(movement.concept),
            textCell(payer.alias),
            textCell(recipient.alias),
            decimalAmount(allocation.amount_cents),
            textCell(CURRENCY),
          ].join(";");
        });
    });

  return `${BOM}${HEADERS.join(";")}\r\n${rows.join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

export function groupMovementsFilename(group: Group): string {
  const slug = group.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `appachas-${slug || "grupo"}-movimientos-${group.today}.csv`;
}

export function downloadGroupMovementsCsv(group: Group): void {
  const url = URL.createObjectURL(
    new Blob([groupMovementsCsv(group)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = groupMovementsFilename(group);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
