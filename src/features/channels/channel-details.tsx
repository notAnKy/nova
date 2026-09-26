"use client";

import { useActionState } from "react";
import { Hash, LockKeyhole, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import { FormSubmit } from "@/features/workspaces/form-submit";
import type { WorkspaceMember, WorkspaceRole } from "@/features/workspaces/types";
import { addPrivateMember, removePrivateMember, type ChannelActionState } from "./actions";
import type { Channel } from "./types";

const initial: ChannelActionState = { status: "idle", message: "" };

export function ChannelDetails({ channel, role, currentUserId, workspaceMembers, memberIds, onClose }: {
  channel: Channel; role: WorkspaceRole; currentUserId: string; workspaceMembers: WorkspaceMember[];
  memberIds: string[]; onClose: () => void;
}) {
  const privateChannel = channel.kind === "private_channel";
  const visibleMembers = privateChannel
    ? workspaceMembers.filter((member) => memberIds.includes(member.user_id)) : workspaceMembers;
  const availableMembers = workspaceMembers.filter((member) => !memberIds.includes(member.user_id));
  const canManage = privateChannel && memberIds.includes(currentUserId) && (role === "owner" || role === "admin");
  const [addState, addAction] = useActionState(addPrivateMember, initial);
  const Icon = privateChannel ? LockKeyhole : Hash;
  return <aside className="detail-panel" aria-label="Channel details">
    <div className="detail-panel__header"><div><h2>Details</h2><span>#{channel.name}</span></div><IconButton label="Close detail panel" onClick={onClose}><X size={19} /></IconButton></div>
    <div className="detail-panel__body">
      <div className="detail-symbol"><Icon size={27} strokeWidth={1.6} /></div>
      <h3>{channel.name}</h3><p className="detail-topic">{channel.topic || "No topic yet."}</p>
      <div className="detail-fact"><span>Visibility</span><strong>{privateChannel ? "Private channel" : "Public channel"}</strong></div>
      <div className="detail-fact"><span>Members</span><strong>{visibleMembers.length} people</strong></div>
      <p className="detail-note">{privateChannel ? "Only members listed here can read and send messages. Workspace admins are not automatically included." : "Everyone in this workspace can read and send in this channel."}</p>
      <div className="channel-detail-members"><h4>{privateChannel ? "Channel members" : "Workspace members"}</h4>
        {visibleMembers.map((member) => <PrivateMemberRow key={member.user_id} member={member} channelId={channel.id}
          canRemove={canManage && memberIds.length > 1} isSelf={member.user_id === currentUserId} />)}
      </div>
      {canManage && availableMembers.length > 0 && <form className="channel-member-form" action={addAction}>
        <input type="hidden" name="channel_id" value={channel.id} />
        <label htmlFor="channel-add-member">Add a workspace member</label>
        <select name="user_id" id="channel-add-member" required defaultValue="">
          <option value="" disabled>Choose a person</option>
          {availableMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || "Workspace member"}</option>)}
        </select>
        <FormSubmit idle="Add member" pending="Adding…" className="small-action" />
        {addState.message && <p className={`workspace-feedback ${addState.status === "error" ? "is-error" : "is-success"}`} role={addState.status === "error" ? "alert" : "status"}>{addState.message}</p>}
      </form>}
    </div>
  </aside>;
}

function PrivateMemberRow({ member, channelId, canRemove, isSelf }: {
  member: WorkspaceMember; channelId: string; canRemove: boolean; isSelf: boolean;
}) {
  const [state, action] = useActionState(removePrivateMember, initial);
  const profile: Profile = member.profile ?? { user_id: member.user_id, display_name: "Member", status_text: "", avatar_url: null };
  return <div className="channel-detail-member"><ProfileAvatar profile={profile} /><span>{profile.display_name}{isSelf ? " (you)" : ""}</span>
    {canRemove && <details className="confirm-action"><summary>Remove</summary><form action={action}>
      <input type="hidden" name="channel_id" value={channelId} /><input type="hidden" name="user_id" value={member.user_id} />
      <FormSubmit idle="Confirm" pending="Removing…" className="danger-button" /></form></details>}
    {state.message && <p className={`workspace-feedback ${state.status === "error" ? "is-error" : "is-success"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
  </div>;
}
