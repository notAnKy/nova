import assert from "node:assert/strict";
import { removeQueuedAttachments } from "../supabase/functions/cleanup-attachments/cleanup.mjs";

const objects = new Set(["expired/path", "deleted/path", "abandoned/path"]);
const metadata = new Map([
  ["expired/path", "ready"], ["deleted/path", "deleting"], ["abandoned/path", "pending"],
]);
const calls = [];
let failFirstRemoval = true;
const db = {
  storage: { from(bucket) {
    assert.equal(bucket, "conversation-attachments");
    return { async remove([path]) {
      calls.push(["storage.remove", path]);
      if (path === "expired/path" && failFirstRemoval) {
        failFirstRemoval = false;
        return { error: new Error("temporary Storage failure") };
      }
      objects.delete(path);
      return { error: null };
    } };
  } },
  async rpc(name, { p_path: path }) {
    assert.equal(name, "forget_cleaned_attachment");
    calls.push(["forget", path]);
    assert.equal(objects.has(path), false, "metadata changed before Storage removal");
    if (metadata.get(path) === "ready") metadata.set(path, "expired");
    else metadata.delete(path);
    return { error: null };
  },
};

const rows = [...metadata.keys()].map((storage_path) => ({ storage_path }));
assert.deepEqual(await removeQueuedAttachments(db, rows), { removed: 2, failed: 1 });
assert.equal(objects.has("expired/path"), true, "failed removal must retain object for retry");
assert.equal(metadata.get("expired/path"), "ready", "failed removal must retain cleanup eligibility");
assert.equal(objects.has("deleted/path"), false);
assert.equal(objects.has("abandoned/path"), false);
assert.equal(metadata.has("deleted/path"), false);
assert.equal(metadata.has("abandoned/path"), false);
assert.deepEqual(await removeQueuedAttachments(db, [{ storage_path: "expired/path" }]),
  { removed: 1, failed: 0 });
assert.equal(objects.has("expired/path"), false);
assert.equal(metadata.get("expired/path"), "expired", "expiry must leave placeholder metadata");
assert.deepEqual(await removeQueuedAttachments(db, []), { removed: 0, failed: 0 });
assert.deepEqual(calls.filter(([operation, path]) =>
  operation === "forget" && path === "expired/path"), [["forget", "expired/path"]]);
console.log("Attachment Storage cleanup, retry, deletion, and abandoned upload checks passed.");
