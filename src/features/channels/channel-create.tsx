"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Hash, LockKeyhole } from "lucide-react";
import { createChannel, type ChannelActionState } from "./actions";
import { normalizeChannelSlug } from "./validation";
import { FormSubmit } from "@/features/workspaces/form-submit";
import type { Workspace } from "@/features/workspaces/types";

const initial: ChannelActionState = { status: "idle", message: "" };

export function ChannelCreate({ workspace }: { workspace: Workspace }) {
  const [state, action] = useActionState(createChannel, initial);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return <main className="workspace-settings-page"><div className="workspace-settings-wrap">
    <header className="workspace-settings-head"><Link href={`/w/${workspace.slug}`}><ArrowLeft size={17} /> Back to workspace</Link><span>{workspace.name} / New channel</span></header>
    <div className="workspace-settings-title"><span className="settings-symbol"><Hash size={25} /></span><div><div className="onboarding-eyebrow">WORKSPACE / CHANNELS</div><h1>Start a conversation<span>.</span></h1><p>Give your team a focused place to talk in {workspace.name}.</p></div></div>
    <section className="settings-section"><div className="settings-section__intro"><h2>New channel</h2><p>Public channels are open to everyone in this workspace. Private channels require an invitation from a channel member with workspace admin rights.</p></div>
      <form className="workspace-form settings-form" action={action}>
        <input type="hidden" name="workspace_id" value={workspace.id} />
        <label htmlFor="channel-name">Channel name</label>
        <input id="channel-name" name="name" minLength={2} maxLength={80} required placeholder="Product planning"
          onChange={(event) => { if (!slugEdited) setSlug(normalizeChannelSlug(event.target.value)); }} />
        <label htmlFor="channel-slug">URL slug</label><div className="slug-field"><span>#</span><input id="channel-slug" name="slug" value={slug} minLength={3} maxLength={48} required
          onChange={(event) => { setSlugEdited(true); setSlug(event.target.value); }} placeholder="product-planning" /></div>
        <label htmlFor="channel-topic">Topic or description</label><input id="channel-topic" name="topic" maxLength={500} placeholder="What belongs in this channel?" />
        <fieldset className="channel-visibility"><legend>Visibility</legend>
          <label><input type="radio" name="kind" value="public_channel" defaultChecked /><Hash size={17} /><span><strong>Public</strong><small>Everyone in the workspace can read and send.</small></span></label>
          <label><input type="radio" name="kind" value="private_channel" /><LockKeyhole size={17} /><span><strong>Private</strong><small>Only people added to this channel can see it.</small></span></label>
        </fieldset>
        {state.status === "error" && <p className="workspace-feedback is-error" role="alert">{state.message}</p>}
        <FormSubmit idle="Create channel" pending="Creating…" />
      </form>
    </section>
  </div></main>;
}
