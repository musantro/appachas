import type { Group } from "../../src/lib/api";

export const origins = {
  source: "https://legacy.example",
  target: "https://app.example",
};
export const groupId = "11111111-1111-4111-8111-111111111111";
export const migrationId = "22222222-2222-4222-8222-222222222222";
export const token = "t".repeat(43);
export const code = "c".repeat(43);

export function migrationGroup(): Group {
  return {
    id: groupId,
    name: "Escapada",
    start_date: "2026-09-10",
    end_date: "2026-09-17",
    timezone: "Europe/Madrid",
    today: "2026-09-10",
    version: 1,
    creator_member_id: "ana",
    my_member_id: "bruno",
    role: "member",
    members: [],
    movements: [],
    balances: [],
    payments: [],
    settlement_text: "",
    total_cents: 0,
  };
}
