"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function signInWithGitHub() {
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const origin = (await headers()).get("origin");
  if (!origin) redirect("/login?error=unavailable");
  const supabase = await createClient();
  let target: string | undefined;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: new URL("/auth/callback", origin).toString() },
    });
    if (!error) target = data.url;
  } catch { /* Network and provider errors use the same human-readable state. */ }
  if (!target) redirect("/login?error=unavailable");
  redirect(target);
}

export async function signOut() {
  if (getSupabaseConfig()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) redirect("/settings/profile?error=signout");
  }
  redirect("/login?signed_out=1");
}
