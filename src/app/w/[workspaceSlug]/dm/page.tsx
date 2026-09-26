import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/features/shell/app-shell";
import { getOrCreateProfile } from "@/features/profile/profile";
import { getWorkspaceBySlug, getOwnRole, listWorkspaces } from "@/features/workspaces/data";
import { listChannels } from "@/features/channels/data";
import { listDirectConversations } from "@/features/direct/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DirectIndexPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(db, workspaceSlug);
  if (!workspace) notFound();
  const [profile, workspaces, role, channels, dms] = await Promise.all([
    getOrCreateProfile(user), listWorkspaces(db), getOwnRole(db, workspace.id, user.id),
    listChannels(db, workspace.id, user.id), listDirectConversations(db, workspace.id, user.id),
  ]);
  if (!role) notFound();
  return <AppShell key={`${workspace.id}:dm`} profile={profile} workspace={workspace} workspaces={workspaces}
    role={role} channels={channels} dms={dms} channel={null} direct={null} initialPage={null}
    initialView="direct" channelMemberIds={[]} workspaceMembers={[]} />;
}
