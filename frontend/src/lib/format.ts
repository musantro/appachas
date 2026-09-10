const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function money(cents: number): string {
  return euroFormatter.format(cents / 100);
}

export function amountInput(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

export function parseAmount(value: string, allowZero = false): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) &&
    (cents > 0 || (allowZero && cents === 0))
    ? cents
    : null;
}

export function equalAmounts(
  total: number,
  ids: string[],
): Record<string, string> {
  return Object.fromEntries(
    ids.map((id, index) => [
      id,
      amountInput(
        Math.floor(total / ids.length) + (index < total % ids.length ? 1 : 0),
      ),
    ]),
  );
}

export function localDate(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

export function dateRange(start: string, end: string): string {
  return `${calendarDate(start)} – ${calendarDate(end)}`;
}

export function initials(alias: string): string {
  return Array.from(alias)[0]?.toLocaleUpperCase("es") ?? "?";
}

export function groupPath(groupId: string, page = ""): string {
  return `/g${page}?group=${encodeURIComponent(groupId)}`;
}

export function entryPath(token: string, page = ""): string {
  return `/g${page}#${encodeURIComponent(token)}`;
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard)
    throw new Error(
      "No se pudo copiar. Selecciona el texto y cópialo manualmente.",
    );
  await navigator.clipboard.writeText(text);
}

export async function shareText(
  text: string,
): Promise<"shared" | "copied" | "cancelled"> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled";
      throw error;
    }
  }
  await copyText(text);
  return "copied";
}
