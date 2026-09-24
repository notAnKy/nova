"use client";

import { Hash, LockKeyhole, Menu, Moon, PanelRight, Search, Sun, UsersRound } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { StateView } from "@/components/ui/state-view";
import { conversations, messagesByConversation, personById, type Message } from "@/fixtures/workspace";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";

type ConversationPanelProps = {
  conversationId: string;
  onOpenMobileNav: () => void;
  onOpenThread: (id: string) => void;
  onOpenDetails: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

export function ConversationPanel({ conversationId, onOpenMobileNav, onOpenThread, onOpenDetails, theme, onToggleTheme }: ConversationPanelProps) {
  const conversation = conversations.find((item) => item.id === conversationId) ?? conversations[1];
  const messages: Message[] = messagesByConversation[conversation.id] ?? [];
  const isDm = conversation.kind === "dm";
  const Icon = conversation.kind === "private" ? LockKeyhole : Hash;
  const person = conversation.personId ? personById(conversation.personId) : null;

  return (
    <section className="conversation-panel" aria-label={`${conversation.name} conversation`}>
      <header className="conversation-header">
        <IconButton label="Open navigation" className="mobile-nav-trigger" onClick={onOpenMobileNav}><Menu size={21} /></IconButton>
        <div className="conversation-header__title">
          <div className="conversation-header__name">{!isDm && <Icon size={21} strokeWidth={2} aria-hidden="true" />}<h1>{conversation.name}</h1>{person?.online && <span className="header-online" title="Online" />}</div>
          <p>{conversation.topic}</p>
        </div>
        <div className="conversation-header__actions">
          <span className="member-count"><UsersRound size={16} aria-hidden="true" />{conversation.members}</span>
          <IconButton label="Search messages — available in Phase 7" disabled><Search size={19} /></IconButton>
          <IconButton label={"Switch to " + (theme === "dark" ? "light" : "dark") + " theme"} className="mobile-theme-trigger" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
          <IconButton label="Show conversation details" onClick={onOpenDetails}><PanelRight size={19} /></IconButton>
        </div>
      </header>
      <div className="timeline" id="timeline" role="log" aria-label="Message history" aria-live="off">
        {messages.length > 0 ? <>
          <div className="timeline-intro">
            <span className="timeline-intro__icon">{isDm ? conversation.name.slice(0, 1) : <Icon size={29} strokeWidth={1.6} />}</span>
            <h2>{isDm ? `Your conversation with ${conversation.name}` : `Welcome to #${conversation.name}`}</h2>
            <p>{isDm ? "This is the beginning of your direct conversation." : conversation.topic}</p>
          </div>
          <div className="day-divider"><span>Today</span></div>
          <div className="timeline-messages">{messages.map((message) => <MessageItem key={message.id} message={message} onOpenThread={onOpenThread} />)}</div>
        </> : <StateView title={isDm ? "A fresh conversation" : `Nothing in #${conversation.name} yet`} description={isDm ? "Direct messages will appear here once messaging is connected. This preview cannot send messages." : "Messages will appear here when the team starts talking. This preview is local only."} />}
      </div>
      <Composer conversationName={isDm ? conversation.name : `#${conversation.name}`} />
    </section>
  );
}
