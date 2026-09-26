"use client";

import { useState } from "react";
import { MessageSquareReply, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import type { ChannelMessage } from "@/features/channels/types";
import type { MessageMutationResult } from "./composer";
import { MentionInput } from "./mention-input";
import { displayMentions, encodeMentions, type MentionSpan } from "./mentions";
import { MessageTimestamp } from "./message-timestamp";
import { AttachmentList } from "./attachment-list";
import { MessageProjectAction } from "@/features/projects/message-project-action";

const emojis = ["👍", "❤️", "😂", "🔥", "🎉", "👀", "✅"];

export function MessageItem({ message, currentUserId, workspaceId, eligible, onEdit, onDelete, onReact, onReply, inThread = false }: {
  message: ChannelMessage; currentUserId: string; workspaceId: string; eligible: Profile[];
  onEdit: (id: string, body: string) => Promise<MessageMutationResult>;
  onDelete: (id: string) => Promise<MessageMutationResult>;
  onReact: (message: ChannelMessage, emoji: string) => Promise<MessageMutationResult>;
  onReply?: (id: string) => void; inThread?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [spans, setSpans] = useState<MentionSpan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const own = message.author_id === currentUserId && !message.deleted_at;
  const profile: Profile = message.profile ?? { user_id: message.author_id, display_name: "Member", status_text: "", avatar_url: null };
  const displayed = displayMentions(message.body, message.mentionProfiles);

  async function save() {
    const body = encodeMentions(draft, spans).trim();
    if (!body || body.length > 4000) { setError("Use 1 to 4,000 characters."); return; }
    setBusy(true); setError("");
    try {
      const result = await onEdit(message.id, body);
      if (result.ok) setEditing(false); else setError(result.error);
    } catch { setError("We couldn’t save this edit."); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError("");
    try {
      const result = await onDelete(message.id);
      if (!result.ok) setError(result.error);
    } catch { setError("We couldn’t delete this message."); }
    finally { setBusy(false); }
  }

  async function toggleReaction(emoji: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await onReact(message, emoji);
      if (!result.ok) setError(result.error);
    } catch { setError("We couldn’t change this reaction."); }
    finally { setBusy(false); }
  }

  return <article id={`message-${message.id}`} className="message-item" aria-label={`Message from ${profile.display_name}`}>
    <ProfileAvatar profile={profile} size="lg" />
    <div className="message-item__content">
      <div className="message-item__meta"><strong>{profile.display_name}</strong><MessageTimestamp iso={message.created_at} />
        {message.edited_at && !message.deleted_at && <span className="message-edited">(edited)</span>}</div>
      {editing ? <div className="message-edit">
        <label className="sr-only" htmlFor={`edit-${message.id}`}>Edit message</label>
        <MentionInput id={`edit-${message.id}`} value={draft} spans={spans} eligible={eligible} disabled={busy}
          onChange={(value, nextSpans) => { setDraft(value); setSpans(nextSpans); }} onSubmit={() => void save()} />
        <div className="message-edit__actions"><button type="button" className="small-action" disabled={busy} onClick={() => void save()}>Save</button>
          <button type="button" className="small-action" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</button></div>
      </div> : <div className={`message-item__body ${message.deleted_at ? "message-deleted" : ""}`}>
        {message.deleted_at ? <p>Message deleted</p> : <p>{displayed.parts.map((part, index) => part.userId
          ? <span key={index} className="message-mention">{part.text}</span> : part.text)}</p>}</div>}
      {!message.deleted_at && <AttachmentList items={message.attachments} />}
      {!message.deleted_at && (message.reactions.length > 0) &&
        <div className="message-reactions" aria-label="Reactions">{message.reactions.map((reaction) =>
          <button type="button" key={reaction.emoji} className={`reaction ${reaction.reacted ? "is-mine" : ""}`}
            aria-label={`${reaction.emoji}, ${reaction.count} reactions, ${reaction.reacted ? "remove yours" : "add yours"}`}
            aria-pressed={reaction.reacted} disabled={busy}
            onClick={() => void toggleReaction(reaction.emoji)}>
            {reaction.emoji} <span>{reaction.count}</span>
          </button>)}</div>}
      {!inThread && message.replyCount > 0 && <button type="button" className="message-thread-link"
        onClick={() => onReply?.(message.id)}>
        <strong>{message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}</strong>
        {message.latestReplyAt && <span>Latest <MessageTimestamp iso={message.latestReplyAt} /></span>}
      </button>}
      {error && <p className="workspace-feedback is-error" role="alert">{error}</p>}
    </div>
    {!editing && <div className="message-actions" aria-label="Message actions">
      {!message.deleted_at && <MessageProjectAction workspaceId={workspaceId} messageId={message.id} />}
      {!message.deleted_at && <details className="reaction-picker">
        <summary className="icon-button" title="Add reaction" aria-label="Add reaction"><SmilePlus size={16} /></summary>
        <div className="reaction-picker__options" aria-label="Choose a reaction">{emojis.map((emoji) =>
          <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={(event) => {
            event.currentTarget.closest("details")!.open = false;
            void toggleReaction(emoji);
          }}>{emoji}</button>)}</div>
      </details>}
      {!inThread && onReply && <button type="button" className="icon-button" title="Reply in thread"
        aria-label="Reply in thread" onClick={() => onReply(message.id)}><MessageSquareReply size={16} /></button>}
      {own && <button type="button" className="icon-button" title="Edit message" aria-label="Edit message" disabled={busy}
        onClick={() => { setDraft(displayed.text); setSpans(displayed.spans); setEditing(true); }}><Pencil size={16} /></button>
      }
      {own && <details className="message-delete-confirm"><summary className="icon-button" title="Delete message" aria-label="Delete message"><Trash2 size={16} /></summary>
        <div><span>Delete this message?</span><button type="button" disabled={busy} onClick={() => void remove()}>Delete</button></div>
      </details>}
    </div>}
  </article>;
}
