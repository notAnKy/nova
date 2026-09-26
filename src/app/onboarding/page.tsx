import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/features/profile/profile";
import { Onboarding } from "@/features/workspaces/onboarding";
import { listWorkspaces } from "@/features/workspaces/data";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const profile = await getOrCreateProfile(user);
  const workspaces = await listWorkspaces(supabase);
  return <Onboarding profile={profile} workspaces={workspaces} />;
}
