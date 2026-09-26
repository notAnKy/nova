"use client";

import { MessageCircle, UsersRound, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { DirectConversation } from "./data";

export function DirectDetails({ conversation, onClose }: { conversation: DirectConversation; onClose: () => void }) {
  const Icon = conversation.kind === "group_direct" ? UsersRound : MessageCircle;
  return <aside className="detail-panel" aria-label="Direct message participants">
    <div className="detail-panel__header"><div><h2>Participants</h2><span>Private conversation</span></div>
      <IconButton label="Close detail panel" onClick={onClose}><X size={19} /></IconButton></div>
    <div className="detail-panel__body"><div className="detail-symbol"><Icon size={27} /></div>
      <h3>{conversation.displayName}</h3><p className="detail-topic">{conversation.participants.length} participants</p>
      <p className="detail-note">Only these workspace members can read and send messages here. Group membership is fixed for this phase.</p>
      <div className="channel-detail-members"><h4>People</h4>{conversation.participants.map((person) =>
        <div className="channel-detail-member" key={person.user_id}><ProfileAvatar profile={person} /><span>{person.display_name}</span></div>)}</div>
    </div>
  </aside>;
}
