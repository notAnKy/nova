"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateWorkspaceInput } from "./validation";

export type WorkspaceActionState = { status: "idle" | "success" | "error"; message: string; inviteUrl?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;

function errorMessage(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "23505") return "That workspace URL is already taken. Try a different slug.";
  const messages: Record<string, string> = {
    authentication_required: "Your session ended. Sign in again to continue.",
    permission_denied: "You don’t have permission to do that in this workspace.",
    workspace_not_found: "This workspace is no longer available to you.",
    invalid_workspace_name: "Workspace name must be 2 to 80 characters.",
    invalid_workspace_slug: "Use a URL slug of 3 to 48 letters, numbers, or single hyphens.",
    invalid_role: "Choose a valid member role.",
    member_not_found: "That member is no longer in this workspace.",
    owner_transfer_required: "The owner cannot leave, be removed, or change roles until ownership transfer is available.",
    use_leave_workspace: "Use Leave workspace to remove yourself.",
    invalid_expiry: "Choose a valid invitation expiry.",
    invalid_max_uses: "Invitation use limit must be between 1 and 25.",
    invitation_not_found: "That invitation is no longer available.",
    invite_invalid: "This invitation link is invalid.",
    invite_revoked: "This invitation link was revoked.",
    invite_expired: "This invitation link has expired.",
    invite_exhausted: "This invitation link has reached its use limit.",
    last_private_channel_member: "Add someone else to each private channel where this person is the last member before removing them.",
  };
  return messages[error.message ?? ""] ?? fallback;
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : supabase;
}

export async function createWorkspace(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const input = validateWorkspaceInput(formData.get("name"), formData.get("slug"));
  if (input.error) return { status: "error", message: input.error };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again to create a workspace." };
  const { data, error } = await supabase.rpc("create_workspace", { p_name: input.name, p_slug: input.slug });
  if (error || !data?.slug) return { status: "error", message: errorMessage(error, "We couldn’t create the workspace. Please try again.") };
  revalidatePath("/");
  redirect(`/w/${data.slug}`);
}

export async function updateWorkspace(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const workspaceId = formData.get("workspace_id");
  if (typeof workspaceId !== "string" || !uuidPattern.test(workspaceId)) return { status: "error", message: "Invalid workspace." };
  const input = validateWorkspaceInput(formData.get("name"), formData.get("slug"));
  if (input.error) return { status: "error", message: input.error };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again to save settings." };
  const { data, error } = await supabase.rpc("update_workspace_settings", {
    p_workspace_id: workspaceId, p_name: input.name, p_slug: input.slug,
  });
  if (error || !data?.slug) return { status: "error", message: errorMessage(error, "We couldn’t save workspace settings.") };
  revalidatePath("/");
  redirect(`/w/${data.slug}/settings?saved=1`);
}

export async function changeMemberRole(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const workspaceId = formData.get("workspace_id");
  const userId = formData.get("user_id");
  const role = formData.get("role");
  if (typeof workspaceId !== "string" || !uuidPattern.test(workspaceId) || typeof userId !== "string" || !uuidPattern.test(userId)
    || (role !== "admin" && role !== "member")) return { status: "error", message: "Choose a valid member and role." };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again." };
  const { error } = await supabase.rpc("change_workspace_member_role", {
    p_workspace_id: workspaceId, p_user_id: userId, p_role: role,
  });
  if (error) return { status: "error", message: errorMessage(error, "We couldn’t change this member’s role.") };
  revalidatePath("/w", "layout");
  return { status: "success", message: "Member role updated." };
}

export async function removeMember(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const workspaceId = formData.get("workspace_id");
  const userId = formData.get("user_id");
  if (typeof workspaceId !== "string" || !uuidPattern.test(workspaceId) || typeof userId !== "string" || !uuidPattern.test(userId))
    return { status: "error", message: "Invalid member." };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again." };
  const { error } = await supabase.rpc("remove_workspace_member", { p_workspace_id: workspaceId, p_user_id: userId });
  if (error) return { status: "error", message: errorMessage(error, "We couldn’t remove this member.") };
  revalidatePath("/w", "layout");
  return { status: "success", message: "Member removed. Existing invitation links were revoked." };
}

export async function leaveWorkspace(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const workspaceId = formData.get("workspace_id");
  if (typeof workspaceId !== "string" || !uuidPattern.test(workspaceId)) return { status: "error", message: "Invalid workspace." };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again." };
  const { error } = await supabase.rpc("leave_workspace", { p_workspace_id: workspaceId });
  if (error) return { status: "error", message: errorMessage(error, "We couldn’t leave this workspace.") };
  revalidatePath("/");
  redirect("/");
}

export async function createInvitation(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const workspaceId = formData.get("workspace_id");
  const role = formData.get("role");
  const expiry = Number(formData.get("expiry_hours"));
  const maxUses = Number(formData.get("max_uses"));
  if (typeof workspaceId !== "string" || !uuidPattern.test(workspaceId)
    || (role !== "member" && role !== "admin") || ![24, 168, 720].includes(expiry)
    || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 25)
    return { status: "error", message: "Choose a role, expiry, and use limit between 1 and 25." };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again." };
  const origin = (await headers()).get("origin");
  if (!origin) return { status: "error", message: "We couldn’t determine this site’s URL. Reload and try again." };
  const { data, error } = await supabase.rpc("create_workspace_invitation", {
    p_workspace_id: workspaceId, p_role: role, p_expiry_hours: expiry, p_max_uses: maxUses,
  });
  if (error || typeof data?.token !== "string" || !tokenPattern.test(data.token))
    return { status: "error", message: errorMessage(error, "We couldn’t create an invitation link.") };
  revalidatePath("/w", "layout");
  return { status: "success", message: "Copy this link now. It will not be shown again.", inviteUrl: new URL(`/invite/${data.token}`, origin).toString() };
}

export async function revokeInvitation(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const invitationId = formData.get("invitation_id");
  if (typeof invitationId !== "string" || !uuidPattern.test(invitationId)) return { status: "error", message: "Invalid invitation." };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again." };
  const { error } = await supabase.rpc("revoke_workspace_invitation", { p_invitation_id: invitationId });
  if (error) return { status: "error", message: errorMessage(error, "We couldn’t revoke that invitation.") };
  revalidatePath("/w", "layout");
  return { status: "success", message: "Invitation revoked." };
}

export async function acceptInvitation(_previous: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !tokenPattern.test(token)) return { status: "error", message: "This invitation link is invalid." };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: "error", message: "Your session ended. Sign in again to join." };
  const { data, error } = await supabase.rpc("accept_workspace_invitation", { p_token: token });
  if (error || typeof data?.slug !== "string") return { status: "error", message: errorMessage(error, "We couldn’t join this workspace.") };
  revalidatePath("/");
  redirect(`/w/${data.slug}`);
}
