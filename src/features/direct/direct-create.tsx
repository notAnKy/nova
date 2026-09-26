"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, MessageCircle, Search, UsersRound } from "lucide-react";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import { FormSubmit } from "@/features/workspaces/form-submit";
import type { Workspace, WorkspaceMember } from "@/features/workspaces/types";
import { createDirectConversation, type DirectActionState } from "./actions";

const initial: DirectActionState = { status: "idle", message: "" };

export function DirectCreate({ workspace, members, currentUserId }: {
  workspace: Workspace; members: WorkspaceMember[]; currentUserId: string;
}) {
  const [state, action] = useActionState(createDirectConversation, initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = members.filter((member) => member.user_id !== currentUserId);
  const visible = candidates.filter((member) =>
    (member.profile?.display_name ?? "Workspace member").toLowerCase().includes(query.toLowerCase()));
  return <main className="workspace-settings-page"><div className="workspace-settings-wrap">
    <header className="workspace-settings-head"><Link href={`/w/${workspace.slug}/dm`}><ArrowLeft size={17} /> Back to messages</Link><span>{workspace.name} / New message</span></header>
    <div className="workspace-settings-title"><span className="settings-symbol"><MessageCircle size={25} /></span><div>
      <div className="onboarding-eyebrow">WORKSPACE / DIRECT MESSAGES</div>
      <h1>Start a message<span>.</span></h1><p>Choose people from {workspace.name}. Only participants can see the conversation.</p>
    </div></div>
    <section className="settings-section"><div className="settings-section__intro"><h2>Recipients</h2>
      <p>Choose one person for a direct message, or two or more for a group message.</p></div>
      <form className="workspace-form settings-form" action={action}>
        <input type="hidden" name="workspace_id" value={workspace.id} />
        {selected.map((id) => <input key={id} type="hidden" name="recipient" value={id} />)}
        <label htmlFor="dm-member-search">Find workspace members</label>
        <div className="dm-search-field"><Search size={17} aria-hidden="true" /><input id="dm-member-search"
          value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" /></div>
        <div className="dm-recipient-list" aria-label="Workspace members">
          {visible.map((member) => {
            const checked = selected.includes(member.user_id);
            const profile = member.profile ?? { user_id: member.user_id, display_name: "Workspace member", status_text: "", avatar_url: null };
            return <label key={member.user_id} className={`dm-recipient ${checked ? "is-selected" : ""}`}>
              <input type="checkbox" value={member.user_id} checked={checked}
                disabled={!checked && selected.length >= 11}
                onChange={() => setSelected((current) => checked
                  ? current.filter((id) => id !== member.user_id) : [...current, member.user_id])} />
              <ProfileAvatar profile={profile} /><span>{profile.display_name}</span>
            </label>;
          })}
          {!visible.length && <p className="sidebar-section__hint">{candidates.length ? "No matching members." : "Invite a workspace member to start a message."}</p>}
        </div>
        <p className="dm-selection-note"><UsersRound size={15} /> {selected.length} selected · up to 11 recipients</p>
        {state.status === "error" && <p className="workspace-feedback is-error" role="alert">{state.message}</p>}
        <FormSubmit idle={selected.length > 1 ? "Start group message" : "Start message"} pending="Opening…" disabled={!selected.length} />
      </form>
    </section>
  </div></main>;
}
