import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug, getOwnRole } from "@/features/workspaces/data";
import { ChannelCreate } from "@/features/channels/channel-create";

export const dynamic = "force-dynamic";

export default async function NewChannelPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(db, workspaceSlug);
  if (!workspace) notFound();
  const role = await getOwnRole(db, workspace.id, user.id);
  if (role !== "owner" && role !== "admin") notFound();
  return <ChannelCreate workspace={workspace} />;
}
