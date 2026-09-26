import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug, getOwnRole, getWorkspaceMembers } from "@/features/workspaces/data";
import { DirectCreate } from "@/features/direct/direct-create";

export const dynamic = "force-dynamic";

export default async function NewDirectPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login?error=expired");
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(db, workspaceSlug);
  if (!workspace || !(await getOwnRole(db, workspace.id, user.id))) notFound();
  const members = await getWorkspaceMembers(db, workspace.id);
  return <DirectCreate workspace={workspace} members={members} currentUserId={user.id} />;
}
