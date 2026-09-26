"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Hash, LockKeyhole, Menu, Moon, PanelRight, Search, Sun, MessageCircle, UsersRound } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { StateView } from "@/components/ui/state-view";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/features/profile/profile";
import { Composer, type MessageMutationResult } from "@/features/conversation/composer";
import { MessageItem } from "@/features/conversation/message-item";
import { ThreadPanel } from "@/features/conversation/thread-panel";
import { getMessageById, getMessagePage, getMessagesByIds, getThreadPage } from "./data";
import type { Channel, ChannelMessage, MessageCursor, MessagePage } from "./types";
import type { DirectConversation } from "@/features/direct/data";
import { cleanUpOwnAttachments } from "@/features/conversation/attachment-files";
import { uploadMessageAttachments } from "@/features/conversation/direct-upload";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mergeMessages(existing: ChannelMessage[], incoming: ChannelMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => {
    const previous = byId.get(message.id);
    const version = message.deleted_at ?? message.edited_at ?? message.created_at;
    const previousVersion = previous?.deleted_at ?? previous?.edited_at ?? previous?.created_at;
    if (!previous || !previousVersion || version >= previousVersion) byId.set(message.id, message);
  });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function mergeFresh(existing: ChannelMessage[], incoming: ChannelMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function ChannelPanel({ channel, initialPage, currentUser, eligibleMentions, onOpenMobileNav, onOpenDetails, onOpenThread, onRead, theme, onToggleTheme }: {
  channel: Channel | DirectConversation; initialPage: MessagePage; currentUser: Profile; eligibleMentions: Profile[];
  onOpenMobileNav: () => void; onOpenDetails: () => void; onOpenThread: () => void; onRead: () => void;
  theme: "dark" | "light"; onToggleTheme: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");
  const targetMessageId = searchParams.get("message");
  const [messages, setMessages] = useState(initialPage.messages);
  const [olderCursor, setOlderCursor] = useState<MessageCursor | null>(initialPage.olderCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notice, setNotice] = useState("");
  const [threadRoot, setThreadRoot] = useState<ChannelMessage | null>(null);
  const [replies, setReplies] = useState<ChannelMessage[]>([]);
  const [threadCursor, setThreadCursor] = useState<MessageCursor | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadLoadingOlder, setThreadLoadingOlder] = useState(false);
  const [threadNotice, setThreadNotice] = useState("");
  const loadedIds = useRef(messages.map((message) => message.id));
  const loadedReplyIds = useRef<string[]>([]);
  const lastMarked = useRef("");
  const onReadRef = useRef(onRead);
  const timeline = useRef<HTMLDivElement>(null);
  const isDirect = channel.kind === "direct" || channel.kind === "group_direct";
  const displayName = isDirect ? channel.displayName : channel.name;
  const conversationLabel = isDirect ? displayName : `#${displayName}`;
  const directStatus = channel.kind === "direct"
    ? channel.participants.find((person) => person.user_id !== currentUser.user_id)?.status_text : "";
  const Icon = channel.kind === "private_channel" ? LockKeyhole
    : channel.kind === "direct" ? MessageCircle : channel.kind === "group_direct" ? UsersRound : Hash;

  useEffect(() => { loadedIds.current = messages.map((message) => message.id); }, [messages]);
  useEffect(() => { loadedReplyIds.current = replies.map((message) => message.id); }, [replies]);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);
  useEffect(() => { void cleanUpOwnAttachments(db); }, [db]);

  useEffect(() => {
    if (!targetMessageId || !idPattern.test(targetMessageId)) return;
    let cancelled = false;
    void getMessageById(db, channel.id, targetMessageId).then((row) => {
      if (cancelled || !row) return;
      if (row.parent_message_id) {
        if (row.parent_message_id !== threadId) return;
        setReplies((current) => mergeFresh(current, [row]));
      } else setMessages((current) => mergeFresh(current, [row]));
      window.setTimeout(() => {
        if (cancelled) return;
        const element = document.getElementById(`message-${targetMessageId}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.classList.add("message-item--jumped");
        window.setTimeout(() => element?.classList.remove("message-item--jumped"), 2500);
      }, 150);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [db, channel.id, targetMessageId, threadId, threadLoading]);

  const refreshThread = useCallback(async () => {
    if (!threadId || !idPattern.test(threadId)) return;
    try {
      const [root, page, loaded] = await Promise.all([
        getMessageById(db, channel.id, threadId),
        getThreadPage(db, channel.id, threadId),
        getMessagesByIds(db, channel.id, loadedReplyIds.current),
      ]);
      if (!root || root.parent_message_id) {
        setThreadRoot(null);
        setThreadNotice("This thread is unavailable.");
        return;
      }
      setThreadRoot(root);
      setReplies((current) => mergeFresh(current.filter((row) => row.parent_message_id === threadId), [...loaded.filter(
        (row) => row.parent_message_id === threadId), ...page.messages]));
      setThreadCursor(page.olderCursor);
      setThreadNotice("");
    } catch { setThreadNotice("Thread updates paused. Reopen it to refresh."); }
  }, [db, channel.id, threadId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setThreadRoot(null); setReplies([]); setThreadCursor(null);
      if (!threadId) return;
      setThreadLoading(true);
      void refreshThread().finally(() => { if (!cancelled) setThreadLoading(false); });
    });
    return () => { cancelled = true; };
  }, [threadId, refreshThread]);

  function setThreadUrl(id: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("thread", id); else next.delete("thread");
    next.delete("message");
    if (id) onOpenThread();
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const reflectMessage = useCallback((row: ChannelMessage, allowAppend = false) => {
    if (row.parent_message_id) {
      if (row.parent_message_id === threadId)
        setReplies((current) => current.some((item) => item.id === row.id)
          ? current.map((item) => item.id === row.id ? row : item)
          : allowAppend ? mergeMessages(current, [row]) : current);
    } else {
      setMessages((current) => current.map((item) => item.id === row.id ? row : item));
      if (row.id === threadId) setThreadRoot(row);
    }
  }, [threadId]);

  const markRead = useCallback(async (id: string) => {
    if (!id || lastMarked.current === id || document.visibilityState !== "visible") return;
    lastMarked.current = id;
    const { error } = await db.rpc("mark_channel_read", { p_conversation_id: channel.id, p_message_id: id });
    if (error) { lastMarked.current = ""; return; }
    onReadRef.current();
  }, [db, channel.id]);

  const refreshDurable = useCallback(async () => {
    try {
      const { data: visible, error } = await db.from("conversations").select("id").eq("id", channel.id).maybeSingle();
      if (error || !visible) {
        setMessages([]);
        setNotice("Your access to this conversation changed. Reload the workspace.");
        router.refresh();
        return;
      }
      const [latest, loaded] = await Promise.all([
        getMessagePage(db, channel.id),
        getMessagesByIds(db, channel.id, loadedIds.current),
      ]);
      setMessages((current) => mergeFresh(current, [...loaded, ...latest.messages]));
      const newest = latest.messages.at(-1);
      if (newest) void markRead(newest.id);
      setNotice("");
    } catch { setNotice("Live updates paused. Reopen this conversation to refresh."); }
  }, [db, channel.id, markRead, router]);

  useEffect(() => {
    const newest = initialPage.messages.at(-1);
    if (newest) void markRead(newest.id);
    timeline.current?.scrollTo({ top: timeline.current.scrollHeight });
  }, [initialPage, markRead]);

  useEffect(() => {
    let closed = false;
    let subscription: ReturnType<typeof db.channel> | null = null;

    async function handleNotice(payload: Record<string, unknown>, event: string) {
      const id = payload?.message_id;
      if (typeof id !== "string" || !idPattern.test(id) || payload.conversation_id !== channel.id) return;
      try {
        const row = await getMessageById(db, channel.id, id);
        if (closed) return;
        if (row) {
          if (row.parent_message_id) {
            if (row.parent_message_id === threadId) reflectMessage(row, event === "message.created");
            const root = await getMessageById(db, channel.id, row.parent_message_id);
            if (!closed && root) reflectMessage(root);
          } else {
            setMessages((current) => current.some((item) => item.id === row.id)
              ? current.map((item) => item.id === row.id ? row : item)
              : event === "message.created" ? mergeMessages(current, [row]) : current);
            if (row.id === threadId) setThreadRoot(row);
            if (document.visibilityState === "visible") void markRead(row.id);
          }
        } else { void refreshDurable(); void refreshThread(); }
      } catch { if (!closed) { void refreshDurable(); void refreshThread(); } }
    }

    function onFocus() { if (document.visibilityState === "visible") { void refreshDurable(); void refreshThread(); } }
    async function connect() {
      try {
        await db.realtime.setAuth();
        if (closed) return;
        subscription = db.channel(`channel:${channel.id}`, { config: { private: true } })
          .on("broadcast", { event: "message.created" }, ({ payload }) => void handleNotice(payload, "message.created"))
          .on("broadcast", { event: "message.updated" }, ({ payload }) => void handleNotice(payload, "message.updated"))
          .on("broadcast", { event: "message.deleted" }, ({ payload }) => void handleNotice(payload, "message.deleted"))
          .on("broadcast", { event: "reaction.changed" }, ({ payload }) => void handleNotice(payload, "reaction.changed"))
          .subscribe((status) => {
            if (closed) return;
            if (status === "SUBSCRIBED") { void refreshDurable(); void refreshThread(); }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setNotice("Connection interrupted. Messages will refresh when it reconnects.");
          });
      } catch { if (!closed) setNotice("Live updates unavailable. Reopen the conversation to retry."); }
    }
    void connect();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      closed = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (subscription) void db.removeChannel(subscription);
    };
  }, [db, channel.id, markRead, refreshDurable, refreshThread, reflectMessage, threadId]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    const element = timeline.current;
    const beforeHeight = element?.scrollHeight ?? 0;
    try {
      const page = await getMessagePage(db, channel.id, olderCursor);
      setMessages((current) => mergeMessages(page.messages, current));
      setOlderCursor(page.olderCursor);
      requestAnimationFrame(() => { if (element) element.scrollTop += element.scrollHeight - beforeHeight; });
    } catch { setNotice("Older messages could not load. Try again."); }
    finally { setLoadingOlder(false); }
  }

  async function loadOlderReplies() {
    if (!threadId || !threadCursor || threadLoadingOlder) return;
    setThreadLoadingOlder(true);
    try {
      const page = await getThreadPage(db, channel.id, threadId, threadCursor);
      setReplies((current) => mergeMessages(page.messages, current));
      setThreadCursor(page.olderCursor);
    } catch { setThreadNotice("Older replies could not load. Try again."); }
    finally { setThreadLoadingOlder(false); }
  }

  async function send(body: string, files: File[] = [], parentId: string | null = null): Promise<MessageMutationResult> {
    let data: { id: string } | null = null;
    let error: { message: string } | null = null;
    if (files.length) {
      const result = await uploadMessageAttachments(db, channel.id, channel.workspace_id,
        body, parentId, files);
      if ("id" in result) data = { id: result.id };
      else error = { message: result.error };
    } else {
      const result = await db.from("messages").insert({
        conversation_id: channel.id, body, ...(parentId ? { parent_message_id: parentId } : {}),
      }).select("id").single();
      data = result.data;
      error = result.error;
    }
    if (error || !data) return { ok: false, error: error?.message === "invalid_mention_recipient"
      ? "Mention only current members of this conversation."
      : error?.message === "too_many_mentions" ? "Use at most 30 mentions in one message."
        : error?.message === "nested_thread_not_allowed" ? "Replies cannot have their own threads."
          : error?.message === "thread_root_not_found" ? "This thread is no longer available."
        : error?.message === "new row violates row-level security policy for table \"messages\""
          ? "You no longer have permission to send here." : error?.message ?? "Message could not be sent. Try again." };
    try {
      const row = await getMessageById(db, channel.id, data.id);
      if (row?.parent_message_id) {
        setReplies((current) => mergeMessages(current, [row]));
        const root = await getMessageById(db, channel.id, row.parent_message_id);
        if (root) reflectMessage(root);
      } else if (row) {
        setMessages((current) => mergeMessages(current, [row]));
        void markRead(row.id);
      }
    } catch { void refreshDurable(); }
    if (!parentId) timeline.current?.scrollTo({ top: timeline.current.scrollHeight, behavior: "smooth" });
    return { ok: true };
  }

  async function edit(id: string, body: string): Promise<MessageMutationResult> {
    const { data, error } = await db.from("messages").update({ body }).eq("id", id)
      .eq("conversation_id", channel.id).eq("author_id", currentUser.user_id).select("id").maybeSingle();
    if (error || !data) return { ok: false, error: error?.message === "invalid_mention_recipient"
      ? "Mention only current members of this conversation."
      : "This message could not be edited. Check your access and try again." };
    try {
      const row = await getMessageById(db, channel.id, id);
      if (row) reflectMessage(row);
    } catch { void refreshDurable(); }
    return { ok: true };
  }

  async function remove(id: string): Promise<MessageMutationResult> {
    const { data, error } = await db.from("messages").update({ deleted_at: new Date().toISOString() })
      .eq("id", id).eq("conversation_id", channel.id).eq("author_id", currentUser.user_id).select("id").maybeSingle();
    if (error || !data) return { ok: false, error: "This message could not be deleted. Check your access and try again." };
    void cleanUpOwnAttachments(db);
    try {
      const row = await getMessageById(db, channel.id, id);
      if (row) reflectMessage(row);
    } catch { void refreshDurable(); }
    return { ok: true };
  }

  async function react(message: ChannelMessage, emoji: string): Promise<MessageMutationResult> {
    if (message.deleted_at) return { ok: false, error: "Deleted messages cannot receive reactions." };
    const mine = message.reactions.some((item) => item.emoji === emoji && item.reacted);
    const request = mine
      ? db.from("message_reactions").delete().eq("message_id", message.id)
        .eq("user_id", currentUser.user_id).eq("emoji", emoji)
      : db.from("message_reactions").insert({ message_id: message.id, emoji });
    const { error } = await request;
    if (error && error.code !== "23505")
      return { ok: false, error: "This reaction could not be changed. Check your access and try again." };
    try {
      const row = await getMessageById(db, channel.id, message.id);
      if (row) reflectMessage(row);
    } catch { void refreshDurable(); void refreshThread(); }
    return { ok: true };
  }

  return <><section className="conversation-panel" aria-label={isDirect ? `${displayName} direct message` : `${conversationLabel} channel`}>
    <header className="conversation-header">
      <IconButton label="Open navigation" className="mobile-nav-trigger" onClick={onOpenMobileNav}><Menu size={21} /></IconButton>
      <div className="conversation-header__title"><div className="conversation-header__name"><Icon size={21} strokeWidth={2} aria-hidden="true" /><h1>{displayName}</h1></div>
        <p>{isDirect ? (directStatus || `${channel.participants.length} participants · private conversation`) : channel.topic || (channel.kind === "private_channel" ? "Private channel" : "Public channel")}</p></div>
      <div className="conversation-header__actions">
        <IconButton label="Search messages — available in Phase 7" disabled><Search size={19} /></IconButton>
        <IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="mobile-theme-trigger" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
        <IconButton label={isDirect ? "Show participants" : "Show channel details"} onClick={() => {
          if (threadId) setThreadUrl(null);
          onOpenDetails();
        }}><PanelRight size={19} /></IconButton>
      </div>
    </header>
    <div className="timeline" ref={timeline} role="log" aria-label="Message history" aria-live="off">
      {olderCursor && <button className="load-older" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load older messages"}</button>}
      <div className="timeline-intro"><span className="timeline-intro__icon"><Icon size={29} strokeWidth={1.6} /></span>
        <h2>{isDirect ? `Start a message with ${displayName}` : `Welcome to #${channel.name}`}</h2>
        <p>{isDirect ? "Only participants can read and send here." : channel.topic || "This is the beginning of this channel."}</p></div>
      {messages.length ? <div className="timeline-messages">{messages.map((message) =>
        <MessageItem key={message.id} message={message} currentUserId={currentUser.user_id}
          workspaceId={channel.workspace_id}
          eligible={eligibleMentions} onEdit={edit} onDelete={remove} onReact={react}
          onReply={setThreadUrl} />)}</div>
        : <StateView title="No messages yet" description="Start the conversation with a message to your team." />}
      {notice && <p className="channel-notice" role="status">{notice}</p>}
    </div>
    <Composer conversationLabel={conversationLabel} eligible={eligibleMentions} onSend={send}
      disabled={!!notice && notice.startsWith("Your access")} />
  </section>
  {threadId && <ThreadPanel root={threadRoot?.id === threadId ? threadRoot : null}
    workspaceId={channel.workspace_id}
    replies={threadRoot?.id === threadId ? replies : []}
    olderCursor={threadRoot?.id === threadId ? threadCursor : null}
    loading={threadLoading} loadingOlder={threadLoadingOlder} notice={threadNotice}
    currentUser={currentUser} eligible={eligibleMentions}
    onClose={() => setThreadUrl(null)} onLoadOlder={() => void loadOlderReplies()}
    onSend={(body, files) => send(body, files, threadId)} onEdit={edit} onDelete={remove} onReact={react} />}
  </>;
}
