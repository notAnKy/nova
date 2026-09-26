import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/features/shell/app-shell";
import { getOrCreateProfile } from "@/features/profile/profile";
import { getWorkspaceBySlug, listWorkspaces } from "@/features/workspaces/data";
import { getOwnRole } from "@/features/workspaces/data";
import { listChannels } from "@/features/channels/data";
import { listDirectConversations } from "@/features/direct/data";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(supabase, workspaceSlug);
  if (!workspace) notFound();
  const [profile, workspaces, role, channels, dms] = await Promise.all([
    getOrCreateProfile(user), listWorkspaces(supabase), getOwnRole(supabase, workspace.id, user.id),
    listChannels(supabase, workspace.id, user.id), listDirectConversations(supabase, workspace.id, user.id),
  ]);
  if (!role) notFound();
  return <AppShell key={workspace.id} profile={profile} workspace={workspace} workspaces={workspaces}
    role={role} channels={channels} dms={dms} channel={null} direct={null} initialPage={null} channelMemberIds={[]} workspaceMembers={[]} />;
}
