export function nearTimelineBottom(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return scrollHeight - scrollTop - clientHeight <= 96;
}

export function shouldAdvanceReadCursor(visible: boolean, nearBottom: boolean) {
  return visible && nearBottom;
}
import type { ChannelMessage } from "./types";

export function mergeMessages(existing: ChannelMessage[], incoming: ChannelMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => {
    const previous = byId.get(message.id);
    const version = message.deleted_at ?? message.edited_at ?? message.created_at;
    const previousVersion = previous?.deleted_at ?? previous?.edited_at ?? previous?.created_at;
    if (!previous || !previousVersion || version >= previousVersion) byId.set(message.id, message);
  });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function mergeFresh(existing: ChannelMessage[], incoming: ChannelMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
