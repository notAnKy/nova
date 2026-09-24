import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  user_id: string;
  display_name: string;
  status_text: string;
  avatar_url: string | null;
};

function initialProfile(user: User): Profile {
  const metadata = user.user_metadata;
  const rawName = metadata?.full_name ?? metadata?.name ?? metadata?.user_name;
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";
  const rawAvatar = metadata?.avatar_url;
  let avatar: string | null = null;
  if (typeof rawAvatar === "string") {
    try {
      const url = new URL(rawAvatar);
      if (url.protocol === "https:" && url.hostname === "avatars.githubusercontent.com") avatar = url.toString().slice(0, 2048);
    } catch { /* Ignore malformed provider metadata. */ }
  }
  return { user_id: user.id, display_name: name || "Nova member", status_text: "", avatar_url: avatar };
}

export async function getOrCreateProfile(user: User): Promise<Profile> {
  const supabase = await createClient();
  const existing = await supabase.from("profiles").select("user_id,display_name,status_text,avatar_url").eq("user_id", user.id).maybeSingle();
  if (existing.error) throw new Error("We couldn’t load your profile. Please try again.");
  if (existing.data) return existing.data as Profile;

  const created = await supabase.from("profiles").insert(initialProfile(user)).select("user_id,display_name,status_text,avatar_url").single();
  if (!created.error && created.data) return created.data as Profile;

  // Two first requests can race. Read the row created by the other request.
  if (created.error?.code === "23505") {
    const retry = await supabase.from("profiles").select("user_id,display_name,status_text,avatar_url").eq("user_id", user.id).single();
    if (!retry.error && retry.data) return retry.data as Profile;
  }
  throw new Error("We couldn’t create your profile. Please try again.");
}
