import assert from "node:assert/strict";
import { File } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { appendAttachmentFiles, prepareClipboardFiles, validateFileSelection } from "../src/features/conversation/attachment-files.ts";
import { githubOAuthQueryParams } from "../src/features/auth/github-oauth.ts";
import { mergeMessages, nearTimelineBottom, shouldAdvanceReadCursor } from "../src/features/channels/timeline-behavior.ts";
import { canHandlePageEscape, escapeParent, safeNovaPrevious } from "../src/features/shell/escape-route.ts";

assert.equal(githubOAuthQueryParams(false), undefined);
assert.deepEqual(githubOAuthQueryParams(true), { prompt: "select_account" });
const auth = createClient("http://127.0.0.1:54321", "local-test-key", { auth: { persistSession: false } });
const choice = await auth.auth.signInWithOAuth({ provider: "github", options: {
  redirectTo: "http://localhost:3001/auth/callback", queryParams: githubOAuthQueryParams(true),
} });
assert.ifError(choice.error);
assert.equal(new URL(choice.data.url).searchParams.get("prompt"), "select_account");

const image = new File([Buffer.from("image")], "image.png", { type: "image/png" });
const screenshot = prepareClipboardFiles([image], new Date("2026-09-26T12:34:56Z"));
assert.equal(screenshot.error, null);
assert.equal(screenshot.files[0].name, "Screenshot-20260926123456.png");
assert.equal(screenshot.files[0].type, "image/png");
assert.deepEqual(prepareClipboardFiles([]), { files: [], error: null }); // Text-only paste is left to the browser.
assert.match(prepareClipboardFiles([new File(["x"], "archive.zip", { type: "application/zip" })]).error, /not supported/);
assert.equal(validateFileSelection([image, image, image, image]), "Choose up to 3 attachments per message.");
assert.equal(appendAttachmentFiles([image, image], [image, image]).error, "Choose up to 3 attachments per message.");
assert.match(validateFileSelection([new File([Buffer.alloc(10 * 1024 * 1024 + 1)], "big.png")]), /10 MB/);
assert.match(validateFileSelection([new File([Buffer.alloc(8 * 1024 * 1024)], "a.png"),
  new File([Buffer.alloc(8 * 1024 * 1024)], "b.png")]), /15 MB/);

assert.equal(nearTimelineBottom(700, 200, 1000), false);
assert.equal(nearTimelineBottom(710, 200, 1000), true);
assert.equal(shouldAdvanceReadCursor(true, true), true);
assert.equal(shouldAdvanceReadCursor(true, false), false);
assert.equal(shouldAdvanceReadCursor(false, true), false);
const first = { id: "a", created_at: "2026-09-26T01:00:00Z", edited_at: null, deleted_at: null };
const second = { id: "b", created_at: "2026-09-26T02:00:00Z", edited_at: null, deleted_at: null };
assert.deepEqual(mergeMessages([first], [second, second, first]).map((row) => row.id), ["a", "b"]);

assert.equal(escapeParent("/settings/profile"), "/");
assert.equal(escapeParent("/w/test1/settings"), "/w/test1");
assert.equal(escapeParent("/w/test1/projects/project-a"), "/w/test1/projects");
assert.equal(escapeParent("/w/test1/dm/new"), "/w/test1/dm");
assert.equal(escapeParent("/w/test1/c/general"), "/w/test1");
assert.equal(escapeParent("/w/test1"), null);
assert.equal(safeNovaPrevious("/w/test1"), true);
assert.equal(safeNovaPrevious("//evil.example"), false);
assert.equal(safeNovaPrevious("https://evil.example"), false);
assert.equal(safeNovaPrevious("/login"), false);
const escape = { key: "Escape", defaultPrevented: false, ctrlKey: false, metaKey: false,
  altKey: false, shiftKey: false, isComposing: false };
assert.equal(canHandlePageEscape(escape, false), true);
assert.equal(canHandlePageEscape(escape, true), false); // Dialog owns Escape.
assert.equal(canHandlePageEscape({ ...escape, defaultPrevented: true }, false), false); // Mention/thread already handled it.
assert.equal(canHandlePageEscape({ ...escape, ctrlKey: true }, false), false);
assert.equal(canHandlePageEscape({ ...escape, isComposing: true }, false), false);
console.log("Postdeployment UX helpers passed");
