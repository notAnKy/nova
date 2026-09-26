import { notFound, redirect } from "next/navigation";
import { WorkspaceSettings } from "@/features/workspaces/workspace-settings";
import { getWorkspaceBySlug, getWorkspaceMembers, getOwnRole, listInvitations } from "@/features/workspaces/data";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage({ params, searchParams }: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(supabase, workspaceSlug);
  if (!workspace) notFound();
  const role = await getOwnRole(supabase, workspace.id, user.id);
  if (!role) notFound();
  const members = await getWorkspaceMembers(supabase, workspace.id);
  const invitations = role === "owner" || role === "admin" ? await listInvitations(supabase, workspace.id) : [];
  const { saved } = await searchParams;
  return <WorkspaceSettings workspace={workspace} role={role} userId={user.id} members={members} invitations={invitations} saved={saved === "1"} />;
}
