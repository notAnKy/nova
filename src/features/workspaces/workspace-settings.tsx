"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Copy, Link2, Settings2 } from "lucide-react";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import {
  changeMemberRole, createInvitation, leaveWorkspace, removeMember, revokeInvitation, updateWorkspace,
  type WorkspaceActionState,
} from "./actions";
import { FormSubmit } from "./form-submit";
import type { Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from "./types";

const initialState: WorkspaceActionState = { status: "idle", message: "" };

function Feedback({ state }: { state: WorkspaceActionState }) {
  return state.message ? <p className={`workspace-feedback ${state.status === "error" ? "is-error" : "is-success"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null;
}

export function WorkspaceSettings({ workspace, role, userId, members, invitations, saved }: {
  workspace: Workspace; role: WorkspaceRole; userId: string; members: WorkspaceMember[];
  invitations: WorkspaceInvitation[]; saved: boolean;
}) {
  const canManage = role === "owner" || role === "admin";
  const [settingsState, settingsAction] = useActionState(updateWorkspace, initialState);
  const [leaveState, leaveAction] = useActionState(leaveWorkspace, initialState);
  return <main className="workspace-settings-page"><div className="workspace-settings-wrap">
    <header className="workspace-settings-head"><Link href={`/w/${workspace.slug}`}><ArrowLeft size={17} /> Back to workspace</Link><span>{workspace.name} / Settings</span></header>
    <div className="workspace-settings-title"><span className="settings-symbol"><Settings2 size={24} /></span><div><div className="onboarding-eyebrow">WORKSPACE / SETTINGS</div><h1>Make this space yours<span>.</span></h1><p>Members, roles, and invitation links for {workspace.name}.</p></div></div>

    <section className="settings-section" aria-labelledby="workspace-details-title"><div className="settings-section__intro"><h2 id="workspace-details-title">Workspace details</h2><p>Names and slugs identify this workspace. Membership still controls access.</p></div>
      {canManage ? <form action={settingsAction} className="workspace-form settings-form"><input type="hidden" name="workspace_id" value={workspace.id} />
        <label htmlFor="settings-name">Name</label><input id="settings-name" name="name" defaultValue={workspace.name} minLength={2} maxLength={80} required />
        <label htmlFor="settings-slug">URL slug</label><div className="slug-field"><span>nova / w /</span><input id="settings-slug" name="slug" defaultValue={workspace.slug} minLength={3} maxLength={48} required /></div>
        <small>Changing the slug changes workspace links. Share the new URL with your team.</small>
        <Feedback state={settingsState} />{saved && !settingsState.message && <p className="workspace-feedback is-success" role="status">Workspace settings saved.</p>}
        <FormSubmit idle="Save details" />
      </form> : <div className="settings-readonly"><strong>{workspace.name}</strong><span>/w/{workspace.slug}</span><small>Only owners and admins can change workspace details.</small></div>}
    </section>

    <section className="settings-section" aria-labelledby="members-title"><div className="settings-section__intro"><h2 id="members-title">Members <span>{members.length}</span></h2><p>Roles come from workspace membership, never profile details.</p></div>
      <div className="member-list">{members.map((member) => <MemberRow key={member.user_id} workspace={workspace} member={member} actorRole={role} isSelf={member.user_id === userId} />)}</div>
      {members.length === 200 && <p className="phase7-status">Showing the first 200 members. Ask an owner to manage larger rosters before expanding this beta.</p>}
    </section>

    {canManage && <InvitationSection workspace={workspace} role={role} invitations={invitations} />}

    <section className="settings-section settings-section--leave" aria-labelledby="leave-title"><div className="settings-section__intro"><h2 id="leave-title">Leave workspace</h2><p>{role === "owner" ? "Owners cannot leave until ownership transfer is available. This protects the workspace from becoming ownerless." : "You’ll lose access immediately. You’ll need a new invitation to rejoin."}</p></div>
      {role !== "owner" && <details className="confirm-action"><summary>Leave {workspace.name}</summary><form action={leaveAction}><input type="hidden" name="workspace_id" value={workspace.id} /><p>Leave this workspace now?</p><FormSubmit idle="Yes, leave workspace" pending="Leaving…" className="danger-button" /></form></details>}
      <Feedback state={leaveState} />
    </section>
  </div></main>;
}

function MemberRow({ workspace, member, actorRole, isSelf }: { workspace: Workspace; member: WorkspaceMember; actorRole: WorkspaceRole; isSelf: boolean }) {
  const [roleState, roleAction] = useActionState(changeMemberRole, initialState);
  const [removeState, removeAction] = useActionState(removeMember, initialState);
  const displayProfile: Profile = member.profile ?? { user_id: member.user_id, display_name: "Member", status_text: "", avatar_url: null };
  const canChangeRole = actorRole === "owner" && member.role !== "owner";
  const canRemove = !isSelf && member.role !== "owner" && (actorRole === "owner" || (actorRole === "admin" && member.role === "member"));
  return <div className="member-row"><ProfileAvatar profile={displayProfile} size="lg" /><div className="member-row__identity"><strong>{displayProfile.display_name}{isSelf ? " (you)" : ""}</strong><span>{member.profile?.status_text || "Workspace member"}</span></div><span className={`role-badge role-badge--${member.role}`}>{member.role}</span>
    {(canChangeRole || canRemove) && <div className="member-row__actions">
      {canChangeRole && <form action={roleAction}><input type="hidden" name="workspace_id" value={workspace.id} /><input type="hidden" name="user_id" value={member.user_id} /><select name="role" defaultValue={member.role} aria-label={`Role for ${displayProfile.display_name}`}><option value="member">Member</option><option value="admin">Admin</option></select><FormSubmit idle="Update" pending="Updating…" className="small-action" /></form>}
      {canRemove && <details className="confirm-action"><summary>Remove</summary><form action={removeAction}><input type="hidden" name="workspace_id" value={workspace.id} /><input type="hidden" name="user_id" value={member.user_id} /><p>Remove {displayProfile.display_name}? Existing invite links will be revoked.</p><FormSubmit idle="Confirm removal" pending="Removing…" className="danger-button" /></form></details>}
      <Feedback state={roleState} /><Feedback state={removeState} />
    </div>}
  </div>;
}

function InvitationSection({ workspace, role, invitations }: { workspace: Workspace; role: WorkspaceRole; invitations: WorkspaceInvitation[] }) {
  const [state, action] = useActionState(createInvitation, initialState);
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    if (!state.inviteUrl) return;
    try { await navigator.clipboard.writeText(state.inviteUrl); setCopied(true); }
    catch { setCopied(false); }
  }
  return <section className="settings-section" aria-labelledby="invitations-title"><div className="settings-section__intro"><h2 id="invitations-title">Invitation links</h2><p>Only owners and admins can create or revoke links. New links are shown once.</p></div>
    <form action={action} className="invitation-form"><input type="hidden" name="workspace_id" value={workspace.id} />
      <label>Role<select name="role" defaultValue="member"><option value="member">Member</option>{role === "owner" && <option value="admin">Admin</option>}</select></label>
      <label>Expires<select name="expiry_hours" defaultValue="168"><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option></select></label>
      <label>Maximum uses<input name="max_uses" type="number" min="1" max="25" defaultValue="1" required /></label>
      <FormSubmit idle="Create link" pending="Creating…" />
    </form>
    <Feedback state={state} />
    {state.inviteUrl && <div className="invitation-created"><label htmlFor="new-invite-url">Your new invitation link</label><div><input id="new-invite-url" readOnly value={state.inviteUrl} onFocus={(event) => event.target.select()} /><button type="button" onClick={copyLink}><Copy size={15} />{copied ? "Copied" : "Copy"}</button></div><small>Share it manually. The raw link is not stored and will disappear when you leave this page.</small></div>}
    <div className="invitation-list"><h3>Recent links</h3>{invitations.length === 0 ? <p>No links yet. Create one when you’re ready to invite someone.</p> : invitations.map((invite) => <InvitationRow key={invite.id} invite={invite} />)}</div>
  </section>;
}

function InvitationRow({ invite }: { invite: WorkspaceInvitation }) {
  const [state, action] = useActionState(revokeInvitation, initialState);
  const active = invite.status === "active";
  const label = { active: "Active", revoked: "Revoked", expired: "Expired", exhausted: "Used up" }[invite.status];
  return <div className="invitation-row"><span className="invitation-row__icon"><Link2 size={17} /></span><div><strong>{invite.intended_role} invitation</strong><small>{invite.uses}/{invite.max_uses} uses · expires {invite.expires_label}</small></div><span className={`invitation-status ${active ? "is-active" : ""}`}>{label}</span>
    {active && <details className="confirm-action"><summary>Revoke</summary><form action={action}><input type="hidden" name="invitation_id" value={invite.id} /><FormSubmit idle="Confirm revoke" pending="Revoking…" className="danger-button" /></form></details>}
    <Feedback state={state} />
  </div>;
}
