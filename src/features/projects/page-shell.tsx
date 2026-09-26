import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/features/shell/app-shell";
import { getOrCreateProfile } from "@/features/profile/profile";
import { getWorkspaceBySlug, getOwnRole, listWorkspaces } from "@/features/workspaces/data";
import { listChannels } from "@/features/channels/data";
import { listDirectConversations } from "@/features/direct/data";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function projectPageContext(workspaceSlug: string) {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const workspace = await getWorkspaceBySlug(db, workspaceSlug);
  if (!workspace) notFound();
  const role = await getOwnRole(db, workspace.id, user.id);
  if (!role) notFound();
  return { db, user, workspace, role };
}

export async function projectPageShell(context: Awaited<ReturnType<typeof projectPageContext>>,
  content: ReactNode, renderedPath: string) {
  const { db, user, workspace, role } = context;
  const [profile, workspaces, channels, dms] = await Promise.all([
    getOrCreateProfile(user), listWorkspaces(db), listChannels(db, workspace.id, user.id),
    listDirectConversations(db, workspace.id, user.id),
  ]);
  return <AppShell profile={profile} workspace={workspace} workspaces={workspaces} role={role}
    channels={channels} dms={dms} channel={null} direct={null} initialPage={null}
    channelMemberIds={[]} workspaceMembers={[]} renderedPath={renderedPath} projectsContent={content} />;
}
