export const TYPING_IDLE_MS = 2500;
export const TYPING_THROTTLE_MS = 1500;
export const TYPING_STALE_MS = 6000;

export type TypingEntry = { userId: string; expiresAt: number };

export function typingSender(payload: Record<string, unknown>, ownUserId: string, names: Map<string, string>): string | null {
  const userId = payload.user_id;
  return typeof userId === "string" && userId !== ownUserId && names.has(userId) &&
    typeof payload.active === "boolean" ? userId : null;
}

export function updateTypingEntries(entries: TypingEntry[], userId: string, active: boolean, now: number): TypingEntry[] {
  const current = entries.filter((entry) => entry.userId !== userId && entry.expiresAt > now);
  return active ? [...current, { userId, expiresAt: now + TYPING_STALE_MS }] : current;
}

export function expireTypingEntries(entries: TypingEntry[], now: number): TypingEntry[] {
  return entries.filter((entry) => entry.expiresAt > now);
}

export function typingLabel(entries: TypingEntry[], names: Map<string, string>): string {
  const people = entries.map((entry) => names.get(entry.userId)).filter((name): name is string => !!name);
  if (!people.length) return "";
  if (people.length === 1) return `${people[0]} is typing…`;
  if (people.length === 2) return `${people[0]} and ${people[1]} are typing…`;
  return `${people.length} people are typing…`;
}
