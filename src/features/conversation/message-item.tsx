"use client";

import { Bookmark, MessageSquare, MoreHorizontal, Smile } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { personById, type Message } from "@/fixtures/workspace";

type MessageItemProps = {
  message: Message;
  onOpenThread?: (id: string) => void;
  compact?: boolean;
};

export function MessageItem({ message, onOpenThread, compact = false }: MessageItemProps) {
  const person = personById(message.authorId);
  return (
    <article className={`message-item ${compact ? "message-item--compact" : ""}`} aria-label={`Message from ${person.name} at ${message.time}`}>
      <Avatar person={person} size="md" />
      <div className="message-item__content">
        <div className="message-item__meta"><strong>{person.name}</strong><time>{message.time}</time></div>
        <div className="message-item__body">
          {message.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {message.code && <code className="message-code">{message.code}</code>}
          {message.link && <a href={message.link.href} target="_blank" rel="noopener noreferrer" className="message-link">{message.link.label} ↗</a>}
        </div>
        {message.reactions && <div className="message-reactions" aria-label="Reactions">
          {message.reactions.map((reaction) => <span key={reaction.emoji} className="reaction" aria-label={`${reaction.count} ${reaction.emoji} reactions`}>{reaction.emoji}<span>{reaction.count}</span></span>)}
        </div>}
        {!compact && message.replies && <button type="button" className="message-thread-link" onClick={() => onOpenThread?.(message.id)}><span className="message-thread-avatars"><span>S</span><span>Y</span></span><strong>{message.replies} {message.replies === 1 ? "reply" : "replies"}</strong><span>{message.threadLabel}</span></button>}
      </div>
      {!compact && <div className="message-actions" aria-label="Message actions">
        <IconButton label="Add reaction — available in Phase 6" disabled><Smile size={16} /></IconButton>
        <IconButton label="Open thread" onClick={() => onOpenThread?.(message.id)}><MessageSquare size={16} /></IconButton>
        <IconButton label="Save message — available in Phase 6" disabled><Bookmark size={16} /></IconButton>
        <IconButton label="More actions — available in a later phase" disabled><MoreHorizontal size={16} /></IconButton>
      </div>}
    </article>
  );
}
