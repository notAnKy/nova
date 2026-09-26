// Local-only integration: provide keys from `supabase status -o json` via environment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { uploadMessageAttachments } from "../src/features/conversation/direct-upload.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const publishable = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (url !== "http://127.0.0.1:54321" || !publishable || !secret)
  throw new Error("Run only against the local Supabase stack with its generated keys.");

const admin = createClient(url, secret, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
async function user(label) {
  const email = `phase10-${label}-${suffix}@example.invalid`;
  const password = `Local-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const db = createClient(url, publishable, { auth: { persistSession: false } });
  const signedIn = await db.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  return { db, id: created.data.user.id };
}

const owner = await user("owner");
const outsider = await user("outsider");
const workspace = await owner.db.rpc("create_workspace", {
  p_name: "Phase 10 local verification", p_slug: `phase10-${suffix}`,
});
assert.ifError(workspace.error);
const workspaceId = workspace.data.id;
const channel = await owner.db.rpc("create_channel", {
  p_workspace_id: workspaceId, p_name: "Private files", p_slug: "private-files",
  p_topic: "", p_kind: "private_channel",
});
assert.ifError(channel.error);
const conversationId = channel.data.id;

const png = new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1])],
  "image.png", { type: "image/png" });
const sent = await uploadMessageAttachments(owner.db, conversationId, workspaceId,
  "Local direct upload", null, [png]);
assert.ok("id" in sent, JSON.stringify(sent));
const attachment = await admin.from("message_attachments")
  .select("storage_path,state,expires_at").eq("message_id", sent.id).single();
assert.ifError(attachment.error);
assert.equal(attachment.data.state, "ready");
assert.ok(Date.parse(attachment.data.expires_at) > Date.now() + 71 * 3600_000);
assert.ok((await owner.db.storage.from("conversation-attachments")
  .download(attachment.data.storage_path)).data);

// All three files and the full 15 MiB message limit bypass the former 4.5 MiB route.
const largeBytes = new Uint8Array(5 * 1024 * 1024);
largeBytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const largeFiles = [1, 2, 3].map((number) =>
  new File([largeBytes], `large-${number}.png`, { type: "image/png" }));
const largeSent = await uploadMessageAttachments(owner.db, conversationId, workspaceId,
  "Full size local test", null, largeFiles);
assert.ok("id" in largeSent, JSON.stringify(largeSent));
const largeRows = await admin.from("message_attachments").select("state,size_bytes,expires_at")
  .eq("message_id", largeSent.id);
assert.ifError(largeRows.error);
assert.equal(largeRows.data.length, 3);
assert.equal(largeRows.data.reduce((sum, row) => sum + row.size_bytes, 0), 15 * 1024 * 1024);
assert.ok(largeRows.data.every((row) => row.state === "ready" && Date.parse(row.expires_at) > Date.now()));

// A workspace member who is not in the private channel still cannot read the object.
const invite = await owner.db.rpc("create_workspace_invitation", {
  p_workspace_id: workspaceId, p_role: "member", p_expiry_hours: 24, p_max_uses: 1,
});
assert.ifError(invite.error);
assert.ifError((await outsider.db.rpc("accept_workspace_invitation", { p_token: invite.data.token })).error);
assert.ok((await outsider.db.storage.from("conversation-attachments")
  .download(attachment.data.storage_path)).error);
assert.ok((await outsider.db.storage.from("conversation-attachments")
  .upload(`${workspaceId}/${conversationId}/${randomUUID()}`, png,
    { contentType: "image/png", upsert: false })).error);

// Bypass browser hints deliberately: the trusted function must reject bad bytes.
const badMessage = await owner.db.from("messages").insert({ conversation_id: conversationId,
  body: "Rejected file" }).select("id").single();
assert.ifError(badMessage.error);
const objectId = randomUUID();
const badPath = `${workspaceId}/${conversationId}/${objectId}`;
const bad = new File(["not really png"], "fake.png", { type: "image/png" });
assert.ifError((await owner.db.rpc("reserve_attachment", {
  p_message_id: badMessage.data.id, p_object_id: objectId,
  p_name: bad.name, p_mime: "image/png", p_size: bad.size,
})).error);
assert.ifError((await owner.db.storage.from("conversation-attachments")
  .upload(badPath, bad, { contentType: "image/png", upsert: false })).error);
assert.ok((await owner.db.rpc("finish_attachments", { p_message_id: badMessage.data.id })).error);
assert.ok((await owner.db.rpc("finalize_validated_attachments", {
  p_message_id: badMessage.data.id, p_actor_id: owner.id,
})).error);
assert.ok((await outsider.db.functions.invoke("finalize-attachments",
  { body: { messageId: badMessage.data.id } })).error);
assert.equal((await admin.from("messages").select("deleted_at")
  .eq("id", badMessage.data.id).single()).data.deleted_at, null);
assert.ok((await owner.db.functions.invoke("finalize-attachments",
  { body: { messageId: badMessage.data.id } })).error);
const rejected = await admin.from("messages").select("deleted_at")
  .eq("id", badMessage.data.id).single();
assert.ifError(rejected.error);
assert.ok(rejected.data.deleted_at);
assert.ok((await owner.db.storage.from("conversation-attachments").download(badPath)).error);
assert.ok((await admin.storage.from("conversation-attachments").download(badPath)).error,
  "Invalid bytes must be removed from Storage, not merely hidden by RLS.");

// Expiry denies a new request immediately, while the parent message persists.
assert.ifError((await admin.from("message_attachments")
  .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
  .eq("message_id", sent.id)).error);
assert.ok((await owner.db.storage.from("conversation-attachments")
  .download(attachment.data.storage_path)).error);
assert.equal((await owner.db.from("messages").select("id").eq("id", sent.id).single()).data.id, sent.id);

console.log("Local 15 MiB direct upload, trusted rejection, private Storage RLS, and expiry passed.");
