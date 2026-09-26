"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, UsersRound } from "lucide-react";
import { acceptInvitation, type WorkspaceActionState } from "./actions";
import { FormSubmit } from "./form-submit";
import type { InvitationPreview } from "./types";

const initialState: WorkspaceActionState = { status: "idle", message: "" };
const statusMessages: Record<string, string> = {
  invalid: "This invitation link isn’t valid. Ask for a new link.",
  expired: "This invitation has expired. Ask a workspace admin for a new link.",
  revoked: "This invitation was revoked. Ask a workspace admin for a new link.",
  exhausted: "This invitation has reached its use limit. Ask for a new link.",
};

export function InvitationPage({ token, preview }: { token: string; preview: InvitationPreview }) {
  const [state, action] = useActionState(acceptInvitation, initialState);
  const active = preview.status === "active";
  const expiresLabel = preview.expires_at
    ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(preview.expires_at))
    : "Soon";
  return <main className="invite-page"><div className="invite-card">
    <Link href="/" className="onboarding-brand">nova<span>.</span></Link>
    <div className="invite-card__icon"><UsersRound size={25} /></div>
    <div className="onboarding-eyebrow">WORKSPACE INVITATION</div>
    <h1>{preview.workspace_name ?? "Invitation unavailable"}<span>.</span></h1>
    {active ? <>
      <p>You’ve been invited to join as a <strong>{preview.intended_role}</strong>. Join only if you recognize this workspace.</p>
      <div className="invite-facts"><span>Expires</span><strong>{expiresLabel}</strong><span>Uses remaining</span><strong>{(preview.max_uses ?? 0) - (preview.uses ?? 0)}</strong></div>
      <form action={action}><input type="hidden" name="token" value={token} />
        {state.status === "error" && <p className="workspace-feedback is-error" role="alert">{state.message}</p>}
        <FormSubmit idle="Join workspace" pending="Joining…" />
      </form>
    </> : preview.status === "already_member" && preview.workspace_slug ? <><p>You’re already a member of this workspace.</p><Link className="workspace-submit" href={`/w/${preview.workspace_slug}`}>Open workspace <ArrowRight size={17} /></Link></>
      : <p role="alert">{statusMessages[preview.status] ?? statusMessages.invalid}</p>}
    <Link href="/" className="invite-back">Back to your workspaces</Link>
  </div></main>;
}
