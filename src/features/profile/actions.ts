"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = { status: "idle" | "success" | "error"; message: string };

export async function saveProfile(_previous: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const displayName = formData.get("display_name");
  const statusText = formData.get("status_text");
  if (typeof displayName !== "string" || typeof statusText !== "string") return { status: "error", message: "Please enter a valid name and status." };
  const name = displayName.trim();
  const status = statusText.trim();
  if (name.length < 1 || name.length > 80) return { status: "error", message: "Your display name must be 1 to 80 characters." };
  if (status.length > 160) return { status: "error", message: "Your status must be 160 characters or fewer." };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { status: "error", message: "Your session ended. Sign in again to save your profile." };

  const { data, error } = await supabase.from("profiles").update({ display_name: name, status_text: status }).eq("user_id", user.id).select("user_id").single();
  if (error || !data) return { status: "error", message: "We couldn’t save your profile. Please try again." };
  revalidatePath("/");
  revalidatePath("/settings/profile");
  return { status: "success", message: "Profile saved." };
}
