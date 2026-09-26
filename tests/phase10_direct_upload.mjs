import assert from "node:assert/strict";
import { uploadMessageAttachments } from "../src/features/conversation/direct-upload.ts";
import { validateStoredAttachments } from "../supabase/functions/finalize-attachments/validation.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const png = new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1])],
  "image.png", { type: "image/png" });

function fakeClient(fail = false) {
  const events = [];
  const db = {
    from(name) {
      assert.equal(name, "messages");
      return {
        insert(value) {
          events.push(["message", value]);
          return { select() { return { async single() { return { data: { id: messageId }, error: null }; } }; } };
        },
        update(value) {
          events.push(["delete", value]);
          return { eq() { return { async is() { return { error: null }; } }; } };
        },
      };
    },
    async rpc(name, args) {
      events.push(["rpc", name, args]);
      if (name === "list_my_attachment_cleanup")
        return { data: [{ storage_path: `${workspaceId}/${conversationId}/44444444-4444-4444-8444-444444444444` }], error: null };
      return { error: null };
    },
    storage: { from(name) {
      assert.equal(name, "conversation-attachments");
      return {
        async upload(path, file, options) {
          events.push(["upload", path, file, options]);
          return { error: null };
        },
        async remove(paths) { events.push(["remove", paths]); return { error: null }; },
      };
    } },
    functions: { async invoke(name, payload) {
      events.push(["function", name, payload]);
      return fail ? { data: { error: "File content rejected." }, error: new Error("HTTP 422") }
        : { data: { id: messageId }, error: null };
    } },
  };
  return { db, events };
}

const success = fakeClient();
assert.deepEqual(await uploadMessageAttachments(success.db, conversationId, workspaceId, "", null, [png]),
  { id: messageId });
assert.equal(success.events[0][0], "message");
assert.equal(success.events[0][1].body, "Shared a file");
assert.equal(success.events[1][1], "reserve_attachment");
assert.match(success.events[2][1], new RegExp(`^${workspaceId}/${conversationId}/[0-9a-f-]{36}$`));
assert.equal(success.events[2][2], png);
assert.deepEqual(success.events[2][3], { contentType: "image/png", upsert: false });
assert.deepEqual(success.events[3], ["function", "finalize-attachments", { body: { messageId } }]);
assert.equal(success.events.some((event) => event[0] === "delete"), false);

const failure = fakeClient(true);
assert.deepEqual(await uploadMessageAttachments(failure.db, conversationId, workspaceId, "hi", null, [png]),
  { error: "File content rejected." });
assert.equal(failure.events.some((event) => event[0] === "delete"), true);
assert.equal(failure.events.some((event) => event[0] === "remove"), true);
assert.equal(failure.events.some((event) => event[1] === "forget_removed_attachment"), true);

const invalid = fakeClient();
assert.match((await uploadMessageAttachments(invalid.db, conversationId, workspaceId, "", null,
  [new File(["bad"], "bad.png", { type: "image/png" })])).error, /unsupported/);
assert.equal(invalid.events.length, 0);

const row = { storage_path: "reserved/path", original_name: "image.png", mime_type: "image/png", size_bytes: png.size };
assert.equal(await validateStoredAttachments([row], async () => png), null);
assert.match(await validateStoredAttachments([row], async () => new Blob(["changed"])), /changed size/);
assert.match(await validateStoredAttachments([row], async () =>
  new Blob([new Uint8Array(png.size)], { type: "image/png" })), /mismatched file content/);
assert.match(await validateStoredAttachments([{ ...row, mime_type: "image/jpeg" }], async () => png), /mismatched/);
assert.match(await validateStoredAttachments([row], async () => null), /missing/);

console.log("Phase 10 direct upload and trusted byte inspection passed.");
