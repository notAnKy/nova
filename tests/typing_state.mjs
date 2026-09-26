import assert from "node:assert/strict";
import { expireTypingEntries, TYPING_IDLE_MS, TYPING_STALE_MS, TYPING_THROTTLE_MS,
  typingLabel, typingSender, updateTypingEntries } from "../src/features/conversation/typing-state.ts";

const names = new Map([["a", "notAnKy"], ["b", "zouzouamin284-max"], ["c", "Third person"]]);
assert.equal(typingSender({ user_id: "a", active: true }, "a", names), null);
assert.equal(typingSender({ user_id: "outsider", active: true }, "a", names), null);
assert.equal(typingSender({ user_id: "b", active: "true" }, "a", names), null);
assert.equal(typingSender({ user_id: "b", active: true }, "a", names), "b");

let entries = updateTypingEntries([], "a", true, 1000);
assert.equal(entries[0].expiresAt, 1000 + TYPING_STALE_MS);
assert.equal(typingLabel(entries, names), "notAnKy is typing…");
entries = updateTypingEntries(entries, "b", true, 2000);
assert.equal(typingLabel(entries, names), "notAnKy and zouzouamin284-max are typing…");
entries = updateTypingEntries(entries, "c", true, 2500);
assert.equal(typingLabel(entries, names), "3 people are typing…");
entries = updateTypingEntries(entries, "a", false, 3000);
assert.deepEqual(entries.map((entry) => entry.userId), ["b", "c"]);
entries = expireTypingEntries(entries, 2000 + TYPING_STALE_MS);
assert.deepEqual(entries.map((entry) => entry.userId), ["c"]);
entries = expireTypingEntries(entries, 2500 + TYPING_STALE_MS);
assert.equal(typingLabel(entries, names), "");
assert.equal(TYPING_IDLE_MS, 2500);
assert.ok(TYPING_THROTTLE_MS < TYPING_IDLE_MS);
console.log("Typing identity, stop, multiple names, throttle, and stale expiry passed");
