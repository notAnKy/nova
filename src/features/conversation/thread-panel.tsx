"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Profile } from "@/features/profile/profile";
import type { ChannelMessage, MessageCursor } from "@/features/channels/types";
import { Composer, type MessageMutationResult } from "./composer";
import { MessageItem } from "./message-item";

export function ThreadPanel({ root, replies, olderCursor, loading, loadingOlder, notice, currentUser,
  workspaceId, eligible, onClose, onLoadOlder, onSend, onEdit, onDelete, onReact }: {
  root: ChannelMessage | null; replies: ChannelMessage[]; olderCursor: MessageCursor | null;
  loading: boolean; loadingOlder: boolean; notice: string; currentUser: Profile; workspaceId: string; eligible: Profile[];
  onClose: () => void; onLoadOlder: () => void;
  onSend: (body: string, files: File[]) => Promise<MessageMutationResult>;
  onEdit: (id: string, body: string) => Promise<MessageMutationResult>;
  onDelete: (id: string) => Promise<MessageMutationResult>;
  onReact: (message: ChannelMessage, emoji: string) => Promise<MessageMutationResult>;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  return <aside className="thread-panel" aria-label="Message thread" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab" || !window.matchMedia("(max-width: 720px)").matches) return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), summary'));
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault(); focusable[0].focus();
    }
  }}>
    <header className="thread-panel__header">
      <div><h2>Thread</h2><span>{root?.replyCount ?? 0} {(root?.replyCount ?? 0) === 1 ? "reply" : "replies"}</span></div>
      <button ref={closeButton} type="button" className="icon-button" aria-label="Close thread" onClick={onClose}><X size={18} /></button>
    </header>
    <div className="thread-panel__history" role="log" aria-label="Thread replies" aria-live="off">
      {loading && <p className="thread-panel__notice" role="status">Loading thread…</p>}
      {root && <div className="thread-panel__root">
        <MessageItem message={root} currentUserId={currentUser.user_id} eligible={eligible}
          workspaceId={workspaceId}
          onEdit={onEdit} onDelete={onDelete} onReact={onReact} inThread />
      </div>}
      {root && <div className="thread-panel__divider"><span>{root.replyCount} {root.replyCount === 1 ? "reply" : "replies"}</span></div>}
      {olderCursor && <button type="button" className="load-older" disabled={loadingOlder} onClick={onLoadOlder}>
        {loadingOlder ? "Loading…" : "Load older replies"}
      </button>}
      {replies.map((reply) => <MessageItem key={reply.id} message={reply} currentUserId={currentUser.user_id}
        workspaceId={workspaceId}
        eligible={eligible} onEdit={onEdit} onDelete={onDelete} onReact={onReact} inThread />)}
      {root && replies.length === 0 && !loading && <p className="thread-panel__notice">No replies yet. Start the thread.</p>}
      {notice && <p className="thread-panel__notice" role="status">{notice}</p>}
    </div>
    {root && <Composer id="thread-draft" conversationLabel="thread" eligible={eligible} onSend={onSend}
      disabled={notice.startsWith("Your access")} />}
  </aside>;
}
