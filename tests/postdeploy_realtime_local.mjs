// Local-only network test. Supply keys from `supabase status -o json`; never use production keys.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { mergeMessages } from "../src/features/channels/timeline-behavior.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const publishable = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (url !== "http://127.0.0.1:54321" || !publishable || !secret)
  throw new Error("This test only runs against the local Supabase stack.");

const admin = createClient(url, secret, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
async function user(label) {
  const email = `realtime-${label}-${suffix}@example.invalid`;
  const password = `Local-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const db = createClient(url, publishable, { auth: { persistSession: false } });
  const signedIn = await db.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  await db.realtime.setAuth();
  return { db, id: created.data.user.id };
}
function subscribed(channel) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 12000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve({ status, error });
      }
    });
  });
}
function listenEvents(channel, event) {
  const backlog = [];
  const waiting = [];
  channel.on("broadcast", { event }, ({ payload }) => {
    const index = waiting.findIndex((entry) => entry.conversationId === payload.conversation_id);
    if (index < 0) { backlog.push(payload); return; }
    const [entry] = waiting.splice(index, 1);
    clearTimeout(entry.timer);
    entry.resolve(payload);
  });
  return (conversationId) => new Promise((resolve, reject) => {
    const index = backlog.findIndex((payload) => payload.conversation_id === conversationId);
    if (index >= 0) { resolve(backlog.splice(index, 1)[0]); return; }
    const entry = { conversationId, resolve, timer: setTimeout(() => reject(new Error(`${event} timed out`)), 12000) };
    waiting.push(entry);
  });
}
async function send(db, conversationId, body) {
  const result = await db.from("messages").insert({ conversation_id: conversationId, body })
    .select("id,conversation_id,body,created_at,author_id").single();
  assert.ifError(result.error);
  return result.data;
}

const a = await user("a"), b = await user("b"), c = await user("c");
const workspace = await a.db.rpc("create_workspace", { p_name: "Realtime test", p_slug: `rt-${suffix}` });
assert.ifError(workspace.error);
const workspaceId = workspace.data.id;
for (const recipient of [b, c]) {
  const invite = await a.db.rpc("create_workspace_invitation", { p_workspace_id: workspaceId,
    p_role: "member", p_expiry_hours: 24, p_max_uses: 1 });
  assert.ifError(invite.error);
  assert.ifError((await recipient.db.rpc("accept_workspace_invitation", { p_token: invite.data.token })).error);
}
async function channel(name, kind) {
  const result = await a.db.rpc("create_channel", { p_workspace_id: workspaceId,
    p_name: name, p_slug: name.toLowerCase(), p_topic: "", p_kind: kind });
  assert.ifError(result.error);
  return result.data.id;
}
const publicId = await channel("General", "public_channel");
const privateId = await channel("Secret", "private_channel");
assert.ifError((await a.db.rpc("add_private_channel_member", { p_conversation_id: privateId, p_user_id: b.id })).error);
const direct = await a.db.rpc("create_or_get_direct", { p_workspace_id: workspaceId, p_other_user_id: b.id });
assert.ifError(direct.error);
const dmId = direct.data.id;

const hints = a.db.channel(`activity:${a.id}`, { config: { private: true } });
const hint = listenEvents(hints, "conversation.changed");
assert.equal((await subscribed(hints)).status, "SUBSCRIBED");
let active = a.db.channel(`channel:${publicId}`, { config: { private: true } });
let messageEvent = listenEvents(active, "message.created");
assert.equal((await subscribed(active)).status, "SUBSCRIBED");
const publicEvent = messageEvent(publicId), publicHint = hint(publicId);
const first = await send(b.db, publicId, "Sent by B to A");
assert.equal((await publicEvent).message_id, first.id);
assert.equal((await publicHint).conversation_id, publicId);
assert.deepEqual(mergeMessages([], [first, first]).map((row) => row.id), [first.id]);
assert.equal((await a.db.from("conversation_reads").select("conversation_id").eq("conversation_id", publicId)).data.length, 0);
assert.ifError((await a.db.rpc("mark_channel_read", { p_conversation_id: publicId, p_message_id: first.id })).error);
assert.equal((await a.db.from("conversation_reads").select("conversation_id").eq("conversation_id", publicId)).data.length, 1);

const outsider = c.db.channel(`channel:${privateId}`, { config: { private: true } });
assert.notEqual((await subscribed(outsider)).status, "SUBSCRIBED");
await c.db.removeChannel(outsider);
await a.db.removeChannel(active);
active = a.db.channel(`channel:${privateId}`, { config: { private: true } });
messageEvent = listenEvents(active, "message.created");
assert.equal((await subscribed(active)).status, "SUBSCRIBED");
const privateEvent = messageEvent(privateId), privateHint = hint(privateId);
const second = await send(b.db, privateId, "Private message");
assert.equal((await privateEvent).message_id, second.id);
assert.equal((await privateHint).conversation_id, privateId);
assert.equal((await c.db.from("messages").select("id").eq("id", second.id)).data.length, 0);

await a.db.removeChannel(active);
active = a.db.channel(`channel:${dmId}`, { config: { private: true } });
messageEvent = listenEvents(active, "message.created");
assert.equal((await subscribed(active)).status, "SUBSCRIBED");
const dmEvent = messageEvent(dmId), dmHint = hint(dmId);
const third = await send(b.db, dmId, "Direct message");
assert.equal((await dmEvent).message_id, third.id);
assert.equal((await dmHint).conversation_id, dmId);
assert.equal((await c.db.from("messages").select("id").eq("id", third.id)).data.length, 0);

await a.db.removeChannel(active);
await a.db.removeChannel(hints);
for (const person of [a, b, c]) person.db.realtime.disconnect();
console.log("Local two-user public, private, DM Realtime and unread integration passed");
