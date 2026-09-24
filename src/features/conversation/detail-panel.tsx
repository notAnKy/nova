"use client";

import { Hash, LockKeyhole, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { conversations, messagesByConversation, sampleThread, type Message } from "@/fixtures/workspace";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";

type DetailPanelProps = {
  conversationId: string;
  threadMessageId: string | null;
  onClose: () => void;
};

export function DetailPanel({ conversationId, threadMessageId, onClose }: DetailPanelProps) {
  const conversation = conversations.find((item) => item.id === conversationId) ?? conversations[1];
  const root = (messagesByConversation[conversationId] ?? []).find((item) => item.id === threadMessageId);
  const threadMessages: Message[] = root?.id === "m1" ? sampleThread : root ? [root] : [];
  const isThread = Boolean(threadMessageId && root);
  const Icon = conversation.kind === "private" ? LockKeyhole : Hash;

  return (
    <aside className="detail-panel" aria-label={isThread ? "Thread" : "Conversation details"}>
      <div className="detail-panel__header"><div><h2>{isThread ? "Thread" : "Details"}</h2><span>{conversation.kind === "dm" ? conversation.name : `#${conversation.name}`}</span></div><IconButton label="Close detail panel" onClick={onClose}><X size={19} /></IconButton></div>
      {isThread ? <>
        <div className="detail-panel__body detail-panel__body--thread">
          {threadMessages.map((message) => <MessageItem key={message.id} message={message} compact />)}
          {threadMessages.length === 1 && <p className="thread-empty">No replies in this preview thread.</p>}
        </div>
        <Composer conversationName="thread" isThread />
      </> : <div className="detail-panel__body">
        <div className="detail-symbol"><Icon size={27} strokeWidth={1.6} /></div>
        <h3>{conversation.name}</h3><p className="detail-topic">{conversation.topic}</p>
        <div className="detail-fact"><span>Members</span><strong>{conversation.members} people</strong></div>
        <div className="detail-fact"><span>Visibility</span><strong>{conversation.kind === "private" ? "Private channel" : conversation.kind === "dm" ? "Direct conversation" : "Public channel"}</strong></div>
        <p className="detail-note">This is a fixture preview. Channel settings and membership management arrive in later phases.</p>
      </div>}
    </aside>
  );
}
