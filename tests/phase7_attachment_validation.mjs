import assert from "node:assert/strict";
import { inspectFile, validateFileSelection } from "../src/features/conversation/attachment-files.ts";

const file = (bytes, name, type = "") => new File([Array.isArray(bytes) ? new Uint8Array(bytes) : bytes], name, { type });
assert.equal(validateFileSelection([{ size: 10 * 1024 * 1024 + 1 }]), "Each file must be between 1 byte and 10 MB.");
assert.equal(validateFileSelection([{ size: 6 * 1024 * 1024 }, { size: 6 * 1024 * 1024 },
  { size: 4 * 1024 * 1024 }]), "Attachments must total 15 MB or less.");
assert.equal(validateFileSelection(Array.from({ length: 4 }, () => ({ size: 1 }))), "Choose up to 3 attachments per message.");
assert.equal((await inspectFile(file([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1], "image.png", "image/png")))?.mime, "image/png");
assert.equal(await inspectFile(file([0x4d,0x5a,0,1], "malware.txt", "text/plain")), null);
assert.equal(await inspectFile(file([0x25,0x50,0x44,0x46,0x2d,1], "wrong.jpg", "image/jpeg")), null);
assert.equal(await inspectFile(file("{invalid}", "bad.json", "application/json")), null);
assert.equal((await inspectFile(file('{"ok":true}', "good.json", "application/json")))?.mime, "application/json");
assert.equal(await inspectFile(file("hello", "archive.zip", "application/zip")), null);
console.log("Phase 7 file content and size validation passed.");
