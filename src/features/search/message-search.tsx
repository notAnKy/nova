"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { displayMentions, mentionIds } from "@/features/conversation/mentions";
import type { Profile } from "@/features/profile/profile";
import type { DirectConversation } from "@/features/direct/data";
import { MessageTimestamp } from "@/features/conversation/message-timestamp";

type Hit = { id: string; conversation_id: string; author_id: string; body: string;
  created_at: string; parent_message_id: string | null; conversation_kind: string;
  conversation_name: string; conversation_slug: string };

export function MessageSearch({ workspaceId, workspaceSlug, dms, onJump }: {
  workspaceId: string; workspaceSlug: string; dms: DirectConversation[]; onJump: (url: string) => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setBusy(true); setError("");
      const { data, error: searchError } = await db.rpc("search_messages", {
        p_workspace_id: workspaceId, p_query: query.trim().slice(0, 100), p_limit: 30,
      });
      if (!active) return;
      if (searchError) { setError("Search is unavailable. Try again."); setHits([]); setBusy(false); return; }
      const rows = (data ?? []) as Hit[];
      const ids = [...new Set(rows.flatMap((row) => [row.author_id, ...mentionIds(row.body)]))];
      if (ids.length) {
        const { data: people } = await db.from("profiles").select("user_id,display_name,status_text,avatar_url").in("user_id", ids);
        if (active) setProfiles(Object.fromEntries(((people ?? []) as Profile[]).map((person) => [person.user_id, person])));
      }
      if (active) { setHits(rows); setBusy(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [db, query, workspaceId, retry]);

  function context(hit: Hit) {
    if (hit.conversation_kind === "direct" || hit.conversation_kind === "group_direct")
      return dms.find((item) => item.id === hit.conversation_id)?.displayName ?? "Direct message";
    return `#${hit.conversation_name}`;
  }
  function jump(hit: Hit) {
    const direct = hit.conversation_kind === "direct" || hit.conversation_kind === "group_direct";
    const base = direct ? `/w/${workspaceSlug}/dm/${hit.conversation_id}`
      : `/w/${workspaceSlug}/c/${hit.conversation_slug}`;
    const params = new URLSearchParams();
    if (hit.parent_message_id) params.set("thread", hit.parent_message_id);
    params.set("message", hit.id);
    onJump(`${base}?${params}`);
  }

  return <div className="home-preview phase7-list">
    <div className="home-preview__eyebrow">WORKSPACE / SEARCH</div>
    <h1>Search messages<span className="home-preview__period">.</span></h1>
    <p className="home-preview__lede">Find messages you can access in this workspace.</p>
    <label className="phase7-search"><Search size={19} /><span className="sr-only">Search messages</span>
      <input autoFocus value={query} maxLength={100} placeholder="Search message text"
        onChange={(event) => { setQuery(event.target.value); setError(""); if (event.target.value.trim().length < 2) { setHits([]); setBusy(false); } }} /></label>
    {busy && <p role="status" className="phase7-status">Searching…</p>}
    {error && <div role="alert" className="workspace-feedback is-error">{error} <button type="button" className="small-action" onClick={() => setRetry((value) => value + 1)}>Retry search</button></div>}
    {!busy && query.trim().length >= 2 && !hits.length && !error && <p className="phase7-status">No visible messages match.</p>}
    <div className="phase7-results">{hits.map((hit) => <button key={hit.id} type="button" className="phase7-result" onClick={() => jump(hit)}>
      <span className="phase7-result__top"><strong>{context(hit)}</strong><span>{hit.parent_message_id ? "Thread reply · " : ""}<MessageTimestamp iso={hit.created_at} /></span></span>
      <span className="phase7-result__author">{profiles[hit.author_id]?.display_name ?? "Member"}</span>
      <span className="phase7-result__body">{displayMentions(hit.body, profiles).text}</span><ArrowRight size={17} />
    </button>)}</div>
  </div>;
}
