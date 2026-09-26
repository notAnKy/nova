"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export type DirectActionState = { status: "idle" | "error"; message: string };

export async function createDirectConversation(_previous: DirectActionState, formData: FormData): Promise<DirectActionState> {
  const workspaceId = formData.get("workspace_id");
  const recipients = formData.getAll("recipient");
  if (!isUuid(workspaceId))
    return { status: "error", message: "Invalid workspace." };
  if (recipients.length < 1 || recipients.length > 11
    || recipients.some((id) => !isUuid(id))
    || new Set(recipients).size !== recipients.length)
    return { status: "error", message: "Choose 1 to 11 distinct workspace members." };

  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return { status: "error", message: "Sign in again to start a message." };
  if (recipients.includes(user.id)) return { status: "error", message: "Choose another workspace member." };
  const { data, error } = recipients.length === 1
    ? await db.rpc("create_or_get_direct", { p_workspace_id: workspaceId, p_other_user_id: recipients[0] })
    : await db.rpc("create_group_direct", { p_workspace_id: workspaceId, p_other_user_ids: recipients });
  if (error || !isUuid(data?.id)) {
    const message = error?.message === "member_not_found" ? "Choose current members of this workspace."
      : error?.message === "workspace_not_found" ? "This workspace is no longer available to you."
      : error?.message === "invalid_group_recipients" || error?.message === "invalid_direct_recipient"
        ? "Choose 1 to 11 distinct workspace members." : "We couldn’t start this message. Try again.";
    return { status: "error", message };
  }
  const { data: workspace } = await db.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle();
  if (!workspace?.slug) return { status: "error", message: "Message created, but its workspace URL could not be loaded. Refresh the page." };
  revalidatePath("/w", "layout");
  redirect(`/w/${workspace.slug}/dm/${data.id}`);
}
