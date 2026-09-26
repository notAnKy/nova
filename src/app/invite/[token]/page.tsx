import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/features/profile/profile";
import { InvitationPage } from "@/features/workspaces/invitation-page";
import type { InvitationPreview } from "@/features/workspaces/types";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!getSupabaseConfig()) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  await getOrCreateProfile(user);
  const { data, error: previewError } = await supabase.rpc("preview_workspace_invitation", { p_token: token });
  const preview = previewError ? { status: "invalid" } as InvitationPreview : data as InvitationPreview;
  return <InvitationPage token={token} preview={preview} />;
}
