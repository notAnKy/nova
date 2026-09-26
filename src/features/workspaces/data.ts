import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/features/profile/profile";
import type { Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function listWorkspaces(supabase: SupabaseClient): Promise<Workspace[]> {
  const { data, error } = await supabase.from("workspaces")
    .select("id,name,slug,created_by,created_at,updated_at").order("created_at", { ascending: true }).limit(100);
  if (error) throw new Error("We couldn’t load your workspaces. Please try again.");
  return (data ?? []) as Workspace[];
}

export async function getWorkspaceBySlug(supabase: SupabaseClient, slug: string): Promise<Workspace | null> {
  const { data, error } = await supabase.from("workspaces")
    .select("id,name,slug,created_by,created_at,updated_at").eq("slug", slug).maybeSingle();
  if (error) throw new Error("We couldn’t load this workspace. Please try again.");
  return data as Workspace | null;
}

export async function getWorkspaceMembers(supabase: SupabaseClient, workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase.from("workspace_members")
    .select("workspace_id,user_id,role,joined_at").eq("workspace_id", workspaceId).order("joined_at").limit(200);
  if (error) throw new Error("We couldn’t load the member list. Please try again.");
  const rows = (data ?? []) as Omit<WorkspaceMember, "profile">[];
  if (rows.length === 0) return [];
  const { data: profiles, error: profileError } = await supabase.from("profiles")
    .select("user_id,display_name,status_text,avatar_url").in("user_id", rows.map((row) => row.user_id));
  if (profileError) throw new Error("We couldn’t load member profiles. Please try again.");
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile as Profile]));
  return rows.map((row) => ({ ...row, profile: profileById.get(row.user_id) ?? null }));
}

export async function getOwnRole(supabase: SupabaseClient, workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const { data, error } = await supabase.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("We couldn’t check your workspace access.");
  return (data?.role as WorkspaceRole | undefined) ?? null;
}

export async function listInvitations(supabase: SupabaseClient, workspaceId: string): Promise<WorkspaceInvitation[]> {
  const { data, error } = await supabase.rpc("list_workspace_invitations", { p_workspace_id: workspaceId });
  if (error) throw new Error("We couldn’t load invitation links. Please try again.");
  const now = Date.now();
  return ((data ?? []) as Omit<WorkspaceInvitation, "status" | "expires_label">[]).map((invite) => ({
    ...invite,
    status: invite.revoked_at ? "revoked" : new Date(invite.expires_at).getTime() <= now ? "expired" : invite.uses >= invite.max_uses ? "exhausted" : "active",
    expires_label: new Date(invite.expires_at).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }),
  }));
}
