import type { SupabaseClient } from "@supabase/supabase-js";
export { inspectFile } from "../../../supabase/functions/_shared/inspect-file.ts";

export const ATTACHMENT_BUCKET = "conversation-attachments";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 3;

const clipboardExtensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "text/plain": "txt", "text/markdown": "md",
  "text/csv": "csv", "application/json": "json",
};
const allowedExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "md", "markdown", "csv", "json"]);

export function prepareClipboardFiles(files: File[], now = new Date()): { files: File[]; error: string | null } {
  const prepared: File[] = [];
  for (const file of files) {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const inferred = clipboardExtensions[file.type];
    const genericName = !file.name || file.name === "image.png" && file.type === "image/png" ||
      !!inferred && !file.name.includes(".");
    const name = genericName
      ? inferred ? `${file.type.startsWith("image/") ? "Screenshot" : "Clipboard"}-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}.${inferred}` : ""
      : file.name;
    if (!name || !allowedExtensions.has(name.split(".").at(-1)?.toLowerCase() ?? "") ||
      (!allowedExtensions.has(extension) && !inferred))
      return { files: [], error: "This clipboard file type is not supported. Use PNG, JPEG, WebP, GIF, PDF, or a supported text file." };
    prepared.push(name === file.name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified }));
  }
  return { files: prepared, error: validateFileSelection(prepared) };
}

export function validateFileSelection(files: File[]): string | null {
  if (files.length > MAX_FILES) return "Choose up to 3 attachments per message.";
  if (files.some((file) => !file.size || file.size > MAX_FILE_BYTES)) return "Each file must be between 1 byte and 10 MB.";
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return "Attachments must total 15 MB or less.";
  return null;
}

export function appendAttachmentFiles(existing: File[], selected: File[]) {
  const files = [...existing, ...selected];
  return { files, error: validateFileSelection(files) };
}

export function formatFileSize(size: number) {
  return size < 1024 ? `${size} B` : size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export async function cleanUpOwnAttachments(db: SupabaseClient) {
  const { data, error } = await db.rpc("list_my_attachment_cleanup", { p_limit: 20 });
  if (error) return;
  for (const row of (data ?? []) as { storage_path: string }[]) {
    const { error: removeError } = await db.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);
    if (!removeError) await db.rpc("forget_removed_attachment", { p_path: row.storage_path });
  }
}
