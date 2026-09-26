import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/features/shell/app-shell";
import { getOrCreateProfile } from "@/features/profile/profile";
import { getWorkspaceBySlug, getWorkspaceMembers, getOwnRole, listWorkspaces } from "@/features/workspaces/data";
import { getChannelBySlug, getMessageById, getMessagePage, getPrivateMemberIds, listChannels } from "@/features/channels/data";
import { listDirectConversations } from "@/features/direct/data";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params, searchParams }: {
  params: Promise<{ workspaceSlug: string; channelSlug: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug, channelSlug } = await params;
  const workspace = await getWorkspaceBySlug(db, workspaceSlug);
  if (!workspace) notFound();
  const channel = await getChannelBySlug(db, workspace.id, channelSlug);
  if (!channel) notFound();
  const { thread } = await searchParams;
  if (thread) {
    if (!isUuid(thread)) notFound();
    const root = await getMessageById(db, channel.id, thread);
    if (!root || root.parent_message_id) notFound();
  }
  const [profile, workspaces, role, channels, dms, initialPage, workspaceMembers, channelMemberIds] = await Promise.all([
    getOrCreateProfile(user), listWorkspaces(db), getOwnRole(db, workspace.id, user.id),
    listChannels(db, workspace.id, user.id), listDirectConversations(db, workspace.id, user.id), getMessagePage(db, channel.id),
    getWorkspaceMembers(db, workspace.id),
    channel.kind === "private_channel" ? getPrivateMemberIds(db, channel.id) : Promise.resolve([]),
  ]);
  if (!role) notFound();
  const privateMemberIds = new Set(channelMemberIds);
  const eligibleMentions = workspaceMembers
    .filter((member) => channel.kind === "public_channel" || privateMemberIds.has(member.user_id))
    .map((member) => member.profile ?? {
      user_id: member.user_id, display_name: "Workspace member", status_text: "", avatar_url: null,
    });
  return <AppShell key={`${workspace.id}:${channel.id}`} profile={profile} workspace={workspace} workspaces={workspaces}
    role={role} channels={channels} dms={dms} channel={channel} direct={null} initialPage={initialPage}
    workspaceMembers={workspaceMembers} channelMemberIds={channelMemberIds} eligibleMentions={eligibleMentions}
    renderedPath={`/w/${workspace.slug}/c/${channel.slug}`} />;
}
