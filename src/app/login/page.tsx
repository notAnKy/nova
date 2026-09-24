import { redirect } from "next/navigation";
import { signInWithGitHub } from "@/features/auth/actions";
import { GitHubButton } from "@/features/auth/github-button";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const errors: Record<string, string> = {
  configuration: "Supabase isn’t configured yet. Add your project URL and publishable key to .env.local.",
  unavailable: "GitHub sign-in could not start. Please try again.",
  service_unavailable: "The sign-in service is unavailable right now. Please try again shortly.",
  cancelled: "GitHub sign-in was cancelled. You can try again whenever you’re ready.",
  invalid_callback: "We couldn’t finish sign-in. Please try again.",
  expired: "Your session ended. Sign in again to continue.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; signed_out?: string }> }) {
  const configured = !!getSupabaseConfig();
  let authUnavailable = false;
  if (configured) {
    const supabase = await createClient();
    let authenticated = false;
    try {
      const { data } = await supabase.auth.getClaims();
      authenticated = !!data?.claims;
    } catch { authUnavailable = true; }
    if (authenticated) redirect("/");
  }
  const params = await searchParams;
  const message = params.error ? errors[params.error] ?? errors.unavailable : authUnavailable ? errors.service_unavailable : null;

  return <main className="auth-page">
    <div className="auth-card">
      <div className="auth-brand"><span className="auth-brand__mark">N</span><span>nova<span className="auth-brand__period">.</span></span></div>
      <div className="auth-card__eyebrow">YOUR WORKSPACE AWAITS</div>
      <h1>Welcome back<span>.</span></h1>
      <p>Sign in to continue to your workspace.</p>
      {message && <div className="auth-alert" role="alert">{message}</div>}
      {!message && params.signed_out && <div className="auth-success" role="status">You’ve signed out.</div>}
      {configured ? <form action={signInWithGitHub}><GitHubButton /></form> : !message && <div className="auth-alert" role="alert">Supabase isn’t configured yet. Add your project URL and publishable key to .env.local.</div>}
      <div className="auth-card__foot">Your workspace content is a preview during Phase 2.</div>
    </div>
  </main>;
}
