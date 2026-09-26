import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { removeQueuedAttachments } from "./cleanup.mjs";

const endpoint = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (request) => {
  if (request.method !== "POST" || !endpoint || !serviceKey)
    return new Response("Unavailable", { status: 503 });
  const db = createClient(endpoint, serviceKey, { auth: { persistSession: false } });
  const token = request.headers.get("x-cleanup-token") ?? "";
  const { data: authorized, error: verifyError } = await db.rpc("verify_attachment_cleanup_token", { p_token: token });
  if (verifyError || authorized !== true) return new Response("Unauthorized", { status: 401 });

  const { data: rows, error: listError } = await db.rpc("list_stale_attachments", { p_limit: 100 });
  if (listError) return new Response("Cleanup query failed", { status: 500 });
  const { removed, failed } = await removeQueuedAttachments(db, (rows ?? []) as { storage_path: string }[]);
  return Response.json({ removed, failed }, { status: failed ? 500 : 200 });
});
