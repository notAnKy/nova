"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, MessageSquareReply } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/features/profile/profile";
import type { DirectConversation } from "@/features/direct/data";
import { MessageTimestamp } from "@/features/conversation/message-timestamp";
import { displayMentions, mentionIds } from "@/features/conversation/mentions";

type Notice = { id: string; actor_id: string; kind: "mention" | "thread_reply";
  conversation_id: string; message_id: string; created_at: string; read_at: string | null };
type Source = { id: string; body: string; parent_message_id: string | null; deleted_at: string | null };
type Conversation = { id: string; kind: string; name: string; slug: string };

export function ActivityView({ workspaceId, workspaceSlug, dms, refreshKey, onRead, onJump }: {
  workspaceId: string; workspaceSlug: string; dms: DirectConversation[]; refreshKey: number;
  onRead: () => void; onJump: (url: string) => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [actors, setActors] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasOlder, setHasOlder] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const { data, error: listError } = await db.from("notifications")
      .select("id,actor_id,kind,conversation_id,message_id,created_at,read_at")
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range((page - 1) * 50, page * 50);
    if (currentRequest !== requestId.current) return;
    if (listError) { setError("Activity could not load."); setBusy(false); return; }
    const rows = ((data ?? []) as Notice[]).slice(0, 50);
    const messageIds = [...new Set(rows.map((row) => row.message_id))];
    const conversationIds = [...new Set(rows.map((row) => row.conversation_id))];
    const actorIds = [...new Set(rows.map((row) => row.actor_id))];
    const [messageResult, conversationResult] = await Promise.all([
      messageIds.length ? db.from("messages").select("id,body,parent_message_id,deleted_at").in("id", messageIds)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length ? db.from("conversations").select("id,kind,name,slug").in("id", conversationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (currentRequest !== requestId.current) return;
    if (messageResult.error || conversationResult.error) {
      setError("Activity could not load."); setBusy(false); return;
    }
    const peopleIds = [...new Set([...actorIds, ...((messageResult.data ?? []) as Source[])
      .flatMap((source) => mentionIds(source.body))])];
    const profileResult = peopleIds.length
      ? await db.from("profiles").select("user_id,display_name,status_text,avatar_url").in("user_id", peopleIds)
      : { data: [], error: null };
    if (currentRequest !== requestId.current) return;
    if (profileResult.error) { setError("Activity could not load."); setBusy(false); return; }
    setHasOlder((data ?? []).length > 50);
    setNotices(rows); setSources(Object.fromEntries(((messageResult.data ?? []) as Source[]).map((row) => [row.id, row])));
    setConversations(Object.fromEntries(((conversationResult.data ?? []) as Conversation[]).map((row) => [row.id, row])));
    setActors(Object.fromEntries(((profileResult.data ?? []) as Profile[]).map((row) => [row.user_id, row])));
    setError(""); setBusy(false);
  }, [db, workspaceId, page]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh, refreshKey]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const { error: updateError } = await db.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId).in("id", ids);
    if (updateError) { setError("Could not mark Activity as read."); return; }
    setNotices((current) => current.map((row) => ids.includes(row.id) ? { ...row, read_at: new Date().toISOString() } : row));
    onRead();
  }

  function jump(row: Notice) {
    const conversation = conversations[row.conversation_id];
    const source = sources[row.message_id];
    if (!conversation || !source || source.deleted_at) return;
    if (!row.read_at) void markRead([row.id]);
    const direct = conversation.kind === "direct" || conversation.kind === "group_direct";
    const base = direct ? `/w/${workspaceSlug}/dm/${conversation.id}` : `/w/${workspaceSlug}/c/${conversation.slug}`;
    const params = new URLSearchParams();
    if (source.parent_message_id) params.set("thread", source.parent_message_id);
    params.set("message", row.message_id);
    onJump(`${base}?${params}`);
  }

  return <div className="home-preview phase7-list">
    <div className="home-preview__eyebrow">WORKSPACE / ACTIVITY</div>
    <h1>Activity<span className="home-preview__period">.</span></h1>
    <p className="home-preview__lede">Mentions and replies to your threads.</p>
    <div className="phase7-list__actions"><button type="button" className="small-action"
      disabled={!notices.some((row) => !row.read_at)} onClick={() => void markRead(notices.filter((row) => !row.read_at).map((row) => row.id))}>
      <Check size={15} /> Mark visible as read</button></div>
    {busy && <p className="phase7-status" role="status">Loading Activity…</p>}
    {error && <div className="workspace-feedback is-error" role="alert">{error} <button type="button" className="small-action" onClick={() => { setBusy(true); void refresh(); }}>Retry Activity</button></div>}
    {!busy && !notices.length && !error && <p className="phase7-status">All caught up. New mentions and replies appear here.</p>}
    <div className="phase7-results">{notices.map((row) => {
      const conversation = conversations[row.conversation_id], source = sources[row.message_id];
      const context = conversation ? (conversation.kind === "direct" || conversation.kind === "group_direct"
        ? dms.find((item) => item.id === conversation.id)?.displayName ?? "Direct message"
        : `#${conversation.name}`) : "Conversation unavailable";
      return <div key={row.id} className={`phase7-result phase7-activity ${!row.read_at ? "is-unread" : ""}`}>
        <span className="phase7-result__icon">{row.kind === "mention" ? <Bell size={17} /> : <MessageSquareReply size={17} />}</span>
        <button type="button" onClick={() => jump(row)} disabled={!conversation || !source || !!source.deleted_at}>
          <span className="phase7-result__top"><strong>{actors[row.actor_id]?.display_name ?? "Member"}
            {row.kind === "mention" ? " mentioned you" : " replied to your thread"}</strong><MessageTimestamp iso={row.created_at} /></span>
          <span className="phase7-result__author">{context}{source?.parent_message_id ? " · Thread" : ""}</span>
          <span className="phase7-result__body">{source ? displayMentions(source.body, actors).text : "Message unavailable"}</span>
        </button>
        {!row.read_at && <button type="button" className="small-action" onClick={() => void markRead([row.id])}>Mark read</button>}
      </div>;
    })}</div>
    {!busy && !error && (page > 1 || hasOlder) && <nav className="phase9-pagination" aria-label="Activity pages">
      {page > 1 && <button type="button" onClick={() => { setBusy(true); setPage((value) => value - 1); }}>Newer activity</button>}
      <span>Page {page}</span>
      {hasOlder && <button type="button" onClick={() => { setBusy(true); setPage((value) => value + 1); }}>Older activity</button>}
    </nav>}
  </div>;
}
