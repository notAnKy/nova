import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { getOrCreateProfile } from "@/features/profile/profile";
import { ProfileForm } from "@/features/profile/profile-form";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  let profile;
  try { profile = await getOrCreateProfile(user); }
  catch { return <main className="settings-page"><div className="settings-card"><h1>Profile unavailable</h1><p>We couldn’t load your profile. Check that the profiles migration is applied, then try again.</p><Link href="/settings/profile">Try again</Link><form action={signOut}><button type="submit">Sign out</button></form></div></main>; }
  const params = await searchParams;

  return <main className="settings-page"><div className="settings-card">
    <div className="settings-nav"><Link href="/">← Back to workspace</Link><form action={signOut}><button type="submit">Sign out</button></form></div>
    <div className="settings-eyebrow">YOUR ACCOUNT</div>
    <h1>Profile settings<span>.</span></h1>
    <p className="settings-lede">Choose how you appear in Nova.</p>
    <div className="profile-identity"><ProfileAvatar profile={profile} size="lg" /><div><strong>{profile.display_name}</strong><small>{user.email ?? "GitHub account"}</small></div></div>
    <p className="profile-hint">Your avatar comes from GitHub. Update it there to change it here in a future sync.</p>
    {params.error === "signout" && <p className="profile-feedback is-error" role="alert">We couldn’t sign you out. Please try again.</p>}
    <ProfileForm profile={profile} />
  </div></main>;
}
