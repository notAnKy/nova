"use client";

import { useFormStatus } from "react-dom";

export function GitHubButton() {
  const { pending } = useFormStatus();
  return <button className="auth-button" type="submit" disabled={pending} aria-busy={pending}>
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="currentColor"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-1.92c-3.13.68-3.79-1.33-3.79-1.33-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 .1.77 2.11 3.28 1.5.1-.73.39-1.23.71-1.51-2.5-.28-5.12-1.25-5.12-5.56 0-1.23.44-2.24 1.16-3.03-.11-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.65 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.55.22 2.7.11 2.98.72.79 1.16 1.8 1.16 3.03 0 4.32-2.62 5.27-5.13 5.55.4.35.75 1.03.75 2.08v3.09c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>
    {pending ? "Connecting to GitHub…" : "Continue with GitHub"}
  </button>;
}

export function SwitchGitHubButton() {
  const { pending } = useFormStatus();
  return <button className="text-action auth-switch-account" type="submit" name="choose_account" value="1" disabled={pending}>
    Use another GitHub account
  </button>;
}
