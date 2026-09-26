"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateChannelInput } from "./validation";

export type ChannelActionState = { status: "idle" | "success" | "error"; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function friendlyError(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === "23505") return "That channel URL is already used in this workspace.";
  const messages: Record<string, string> = {
    permission_denied: "You don’t have permission to do that.",
    workspace_not_found: "This workspace is unavailable.",
    channel_not_found: "This channel is unavailable.",
    member_not_found: "Choose a current workspace member.",
    channel_member_not_found: "This person is no longer in the channel.",
    last_private_channel_member: "Add another private channel member before removing the last one.",
    invalid_channel_name: "Channel name must be 2 to 80 characters.",
    invalid_channel_slug: "Use a channel URL of 3 to 48 letters, numbers, or single hyphens.",
    invalid_channel_topic: "Topic must be at most 500 characters.",
  };
  return messages[error?.message ?? ""] ?? fallback;
}

async function authenticatedClient() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  return error || !user ? null : db;
}

export async function createChannel(_previous: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  const workspaceId = formData.get("workspace_id");
  if (typeof workspaceId !== "string" || !uuid.test(workspaceId)) return { status: "error", message: "Invalid workspace." };
  const input = validateChannelInput(formData.get("name"), formData.get("slug"), formData.get("topic"), formData.get("kind"));
  if (input.error) return { status: "error", message: input.error };
  const db = await authenticatedClient();
  if (!db) return { status: "error", message: "Sign in again to create a channel." };
  const { data, error } = await db.rpc("create_channel", {
    p_workspace_id: workspaceId, p_name: input.name, p_slug: input.slug,
    p_topic: input.topic, p_kind: input.kind,
  });
  if (error || typeof data?.slug !== "string")
    return { status: "error", message: friendlyError(error, "We couldn’t create this channel.") };
  const { data: workspace } = await db.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle();
  if (!workspace?.slug) return { status: "error", message: "Channel created, but its workspace URL could not be loaded. Refresh the page." };
  revalidatePath("/w", "layout");
  redirect(`/w/${workspace.slug}/c/${data.slug}`);
}

export async function addPrivateMember(_previous: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  const channelId = formData.get("channel_id");
  const userId = formData.get("user_id");
  if (typeof channelId !== "string" || !uuid.test(channelId) || typeof userId !== "string" || !uuid.test(userId))
    return { status: "error", message: "Choose a valid member." };
  const db = await authenticatedClient();
  if (!db) return { status: "error", message: "Sign in again." };
  const { error } = await db.rpc("add_private_channel_member", { p_conversation_id: channelId, p_user_id: userId });
  if (error) return { status: "error", message: friendlyError(error, "We couldn’t add this member.") };
  revalidatePath("/w", "layout");
  return { status: "success", message: "Member added to this private channel." };
}

export async function removePrivateMember(_previous: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  const channelId = formData.get("channel_id");
  const userId = formData.get("user_id");
  if (typeof channelId !== "string" || !uuid.test(channelId) || typeof userId !== "string" || !uuid.test(userId))
    return { status: "error", message: "Invalid member." };
  const db = await authenticatedClient();
  if (!db) return { status: "error", message: "Sign in again." };
  const { error } = await db.rpc("remove_private_channel_member", { p_conversation_id: channelId, p_user_id: userId });
  if (error) return { status: "error", message: friendlyError(error, "We couldn’t remove this member.") };
  revalidatePath("/w", "layout");
  return { status: "success", message: "Member removed from this private channel." };
}
