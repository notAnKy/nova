"use client";

import { useSyncExternalStore } from "react";
import { formatLocalMessageTime } from "./format-message-time";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function MessageTimestamp({ iso }: { iso: string }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const formatted = mounted ? formatLocalMessageTime(iso) : null;
  return <time dateTime={iso} title={formatted?.full} aria-label={formatted?.full}>
    {formatted?.short ?? "…"}
  </time>;
}
