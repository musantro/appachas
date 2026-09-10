import { entryPath } from "./format";

export type EntryLinks = { memberUrl?: string; creatorUrl?: string };

// Secret links are only available during this document's lifetime. They never
// enter localStorage, sessionStorage, or history state.
const links = new Map<string, EntryLinks>();
const pendingTokens = new Map<string, string>();

export function rememberPendingEntry(groupId: string, token: string): void {
  pendingTokens.set(groupId, token);
}

export function pendingEntry(groupId: string): string | undefined {
  return pendingTokens.get(groupId);
}

export function forgetPendingEntry(groupId: string): void {
  pendingTokens.delete(groupId);
}

export function rememberEntryLinks(groupId: string, next: EntryLinks): void {
  links.set(groupId, { ...links.get(groupId), ...next });
}

export function rememberEntryToken(
  groupId: string,
  token: string,
  role: "creator" | "member",
): void {
  const url = `${window.location.origin}${entryPath(token)}`;
  rememberEntryLinks(
    groupId,
    role === "creator" ? { creatorUrl: url } : { memberUrl: url },
  );
}

export function entryLinks(groupId: string): EntryLinks {
  return links.get(groupId) ?? {};
}

export function forgetEntryLinks(groupId: string): void {
  links.delete(groupId);
  forgetPendingEntry(groupId);
}
