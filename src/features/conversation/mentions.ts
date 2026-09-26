import type { Profile } from "@/features/profile/profile";

const tokenPattern = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

export type MentionSpan = { start: number; end: number; userId: string };
export type MentionPart = { text: string; userId?: string };

export function mentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(tokenPattern)].map((match) => match[1].toLowerCase()))];
}

export function displayMentions(body: string, profiles: Record<string, Profile>): {
  text: string; spans: MentionSpan[]; parts: MentionPart[];
} {
  const parts: MentionPart[] = [];
  const spans: MentionSpan[] = [];
  let text = "";
  let previous = 0;
  for (const match of body.matchAll(tokenPattern)) {
    const before = body.slice(previous, match.index);
    if (before) { parts.push({ text: before }); text += before; }
    const userId = match[1].toLowerCase();
    const visible = `@${profiles[userId]?.display_name ?? "Former member"}`;
    spans.push({ start: text.length, end: text.length + visible.length, userId });
    parts.push({ text: visible, userId });
    text += visible;
    previous = match.index + match[0].length;
  }
  const tail = body.slice(previous);
  if (tail) { parts.push({ text: tail }); text += tail; }
  return { text, spans, parts };
}

export function encodeMentions(text: string, spans: MentionSpan[]): string {
  let body = "";
  let previous = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < previous || span.end > text.length || !text.slice(span.start, span.end).startsWith("@")) continue;
    body += text.slice(previous, span.start) + `@[${span.userId}]`;
    previous = span.end;
  }
  return body + text.slice(previous);
}

export function updateMentionSpans(before: string, after: string, spans: MentionSpan[]): MentionSpan[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--; newEnd--;
  }
  const delta = after.length - before.length;
  return spans.flatMap((span) => {
    if (span.end <= start) return [span];
    if (span.start >= oldEnd) return [{ ...span, start: span.start + delta, end: span.end + delta }];
    return [];
  });
}
