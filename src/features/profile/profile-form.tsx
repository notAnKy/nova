"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Profile } from "./profile";
import { saveProfile, type ProfileActionState } from "./actions";

const initialState: ProfileActionState = { status: "idle", message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return <button className="profile-save" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : "Save changes"}</button>;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(saveProfile, initialState);
  return <form action={action} className="profile-form">
    <label htmlFor="display-name">Display name</label>
    <input id="display-name" name="display_name" type="text" defaultValue={profile.display_name} minLength={1} maxLength={80} required autoComplete="nickname" />
    <span className="profile-hint">This is how you’ll appear to other members.</span>
    <label htmlFor="status-text">Status</label>
    <input id="status-text" name="status_text" type="text" defaultValue={profile.status_text} maxLength={160} placeholder="What are you working on?" />
    <span className="profile-hint">A short line about your day. Up to 160 characters.</span>
    {state.message && <p className={state.status === "success" ? "profile-feedback is-success" : "profile-feedback is-error"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    <SaveButton />
  </form>;
}
