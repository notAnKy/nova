import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/features/shell/app-shell";
import { getOrCreateProfile } from "@/features/profile/profile";
import { getWorkspaceBySlug, getOwnRole, listWorkspaces } from "@/features/workspaces/data";
import { getMessageById, getMessagePage, listChannels } from "@/features/channels/data";
import { getDirectConversation, listDirectConversations } from "@/features/direct/data";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

export default async function DirectPage({ params, searchParams }: {
  params: Promise<{ workspaceSlug: string; conversationId: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug, conversationId } = await params;
  if (!isUuid(conversationId)) notFound();
  const workspace = await getWorkspaceBySlug(db, workspaceSlug);
  if (!workspace) notFound();
  const role = await getOwnRole(db, workspace.id, user.id);
  if (!role) notFound();
  const direct = await getDirectConversation(db, workspace.id, conversationId, user.id);
  if (!direct) notFound();
  const { thread } = await searchParams;
  if (thread) {
    if (!isUuid(thread)) notFound();
    const root = await getMessageById(db, direct.id, thread);
    if (!root || root.parent_message_id) notFound();
  }
  const [profile, workspaces, channels, dms, initialPage] = await Promise.all([
    getOrCreateProfile(user), listWorkspaces(db),
    listChannels(db, workspace.id, user.id), listDirectConversations(db, workspace.id, user.id),
    getMessagePage(db, direct.id),
  ]);
  const visibleDms = dms.some((item) => item.id === direct.id) ? dms : [...dms, direct];
  return <AppShell key={`${workspace.id}:${direct.id}`} profile={profile} workspace={workspace} workspaces={workspaces}
    role={role} channels={channels} dms={visibleDms} channel={null} direct={direct} initialPage={initialPage}
    channelMemberIds={[]} workspaceMembers={[]} eligibleMentions={direct.participants}
    renderedPath={`/w/${workspace.slug}/dm/${direct.id}`} />;
}
