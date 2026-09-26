import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { validateStoredAttachments, type ReservedAttachment } from "./validation.ts";

const endpoint = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const bucket = "conversation-attachments";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

async function discard(db: SupabaseClient, messageId: string, actorId: string,
  rows: ReservedAttachment[]) {
  // Soft deletion queues any object that cannot be removed now for the hourly worker.
  const { error: deleteError } = await db.from("messages").update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId).eq("author_id", actorId).is("deleted_at", null);
  if (deleteError) return;
  for (const row of rows) {
    const { error: removeError } = await db.storage.from(bucket).remove([row.storage_path]);
    if (!removeError) await db.rpc("forget_cleaned_attachment", { p_path: row.storage_path });
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!endpoint || !serviceKey) return json({ error: "Attachment validation is unavailable." }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > 1024)
    return json({ error: "Invalid request." }, 413);
  const bearer = request.headers.get("authorization") ?? "";
  if (!bearer.startsWith("Bearer ")) return json({ error: "Sign in to send files." }, 401);
  const db = createClient(endpoint, serviceKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await db.auth.getUser(bearer.slice(7));
  if (authError || !user) return json({ error: "Sign in to send files." }, 401);

  let messageId: string;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || !("messageId" in input) ||
      typeof input.messageId !== "string" || !uuid.test(input.messageId)) throw new Error();
    messageId = input.messageId;
  } catch { return json({ error: "Invalid message." }, 400); }

  // The privileged RPC verifies current conversation membership and author identity,
  // then freezes pending paths. User INSERT/DELETE policies no longer match them.
  const { error: beginError } = await db.rpc("begin_attachment_validation", {
    p_message_id: messageId, p_actor_id: user.id,
  });
  if (beginError) return json({ error: "Attachments are unavailable for validation." }, 403);

  let rows: ReservedAttachment[] = [];
  try {
    const { data, error } = await db.from("message_attachments")
      .select("storage_path,original_name,mime_type,size_bytes,state")
      .eq("message_id", messageId);
    if (error || !data || data.some((row) => row.state !== "validating"))
      throw new Error("Attachment metadata is unavailable.");
    rows = data as ReservedAttachment[];
    const invalid = await validateStoredAttachments(rows, async (path) => {
      const { data: blob, error: downloadError } = await db.storage.from(bucket).download(path);
      return downloadError ? null : blob;
    });
    if (invalid) throw new Error(invalid);
    const { error: finishError } = await db.rpc("finalize_validated_attachments", {
      p_message_id: messageId, p_actor_id: user.id,
    });
    if (finishError) throw new Error("Attachment finalization failed.");
    return json({ id: messageId });
  } catch (error) {
    await discard(db, messageId, user.id, rows);
    return json({ error: error instanceof Error ? error.message : "Attachment validation failed." }, 422);
  }
});
