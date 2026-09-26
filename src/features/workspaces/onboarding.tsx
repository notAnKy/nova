"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Plus, UsersRound } from "lucide-react";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import { signOut } from "@/features/auth/actions";
import { createWorkspace, type WorkspaceActionState } from "./actions";
import { FormSubmit } from "./form-submit";
import { normalizeSlug } from "./validation";
import type { Workspace } from "./types";

const initialState: WorkspaceActionState = { status: "idle", message: "" };

export function Onboarding({ profile, workspaces }: { profile: Profile; workspaces: Workspace[] }) {
  const [state, action] = useActionState(createWorkspace, initialState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  return <main className="workspace-onboarding">
    <div className="onboarding-top"><Link href="/" className="onboarding-brand">nova<span>.</span></Link><div><Link href="/settings/profile" aria-label="Your profile"><ProfileAvatar profile={profile} /></Link><form action={signOut}><button type="submit">Sign out</button></form></div></div>
    <div className="onboarding-content">
      <div className="onboarding-eyebrow">WORKSPACES / GET STARTED</div>
      <h1>{workspaces.length ? "Make room for something new" : "A place for your team starts here"}<span>.</span></h1>
      <p>{workspaces.length ? "Create another space with its own members and invitation links." : "Create a workspace, invite your people, and keep the conversation moving."}</p>
      {workspaces.length > 0 && <section className="onboarding-existing" aria-label="Your workspaces"><h2>Your workspaces</h2>{workspaces.map((workspace) => <Link href={`/w/${workspace.slug}`} key={workspace.id}>{workspace.name}<ArrowRight size={16} /></Link>)}</section>}
      <div className="onboarding-grid"><section className="onboarding-card">
        <div className="onboarding-card__icon"><Plus size={21} /></div>
        <h2>Create a workspace</h2>
        <p>Start with a name and a readable URL. You’ll become its owner.</p>
        <form action={action} className="workspace-form">
          <label htmlFor="workspace-name">Workspace name</label>
          <input id="workspace-name" name="name" value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slugTouched) setSlug(normalizeSlug(next)); }} minLength={2} maxLength={80} required placeholder="Acme studio" />
          <label htmlFor="workspace-slug">URL slug</label>
          <div className="slug-field"><span>nova / w /</span><input id="workspace-slug" name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} minLength={3} maxLength={48} required placeholder="acme-studio" /></div>
          <small>3–48 lowercase letters, numbers, and single hyphens. You can change it later.</small>
          {state.status === "error" && <p className="workspace-feedback is-error" role="alert">{state.message}</p>}
          <FormSubmit idle="Create workspace" pending="Creating…" />
        </form>
      </section><section className="onboarding-aside">
        <span><UsersRound size={22} /></span><h2>Joining a team?</h2>
        <p>Ask an owner or admin to share an invitation link. Opening it lets you review the workspace before you join.</p>
      </section></div>
    </div>
  </main>;
}
