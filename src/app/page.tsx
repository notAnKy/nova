import { AppShell } from "@/features/shell/app-shell";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { getOrCreateProfile } from "@/features/profile/profile";
import type { Profile } from "@/features/profile/profile";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  let profile: Profile | null = null;
  try { profile = await getOrCreateProfile(user); }
  catch { /* The retry state below handles profile setup and network errors. */ }
  if (!profile) return <main className="route-error"><div className="state-view"><h1>We couldn’t load your profile</h1><p>Check that the profiles migration is applied, then try again.</p><Link className="primary-button" href="/">Try again</Link><form action={signOut}><button className="text-action" type="submit">Sign out</button></form></div></main>;
  return <AppShell profile={profile} />;
}
