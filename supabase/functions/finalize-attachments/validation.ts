import { inspectFile } from "../_shared/inspect-file.ts";

export type ReservedAttachment = {
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

export async function validateStoredAttachments(
  rows: ReservedAttachment[],
  download: (path: string) => Promise<Blob | null>,
): Promise<string | null> {
  if (rows.length < 1 || rows.length > 3 ||
      rows.some((row) => row.size_bytes < 1 || row.size_bytes > 10 * 1024 * 1024) ||
      rows.reduce((sum, row) => sum + row.size_bytes, 0) > 15 * 1024 * 1024)
    return "Attachment limits were exceeded.";

  for (const row of rows) {
    const blob = await download(row.storage_path);
    if (!blob || blob.size !== row.size_bytes) return "An uploaded file was missing or changed size.";
    const checked = await inspectFile(new File([blob], row.original_name, { type: blob.type }));
    if (!checked || checked.mime !== row.mime_type)
      return `${row.original_name}: unsupported or mismatched file content.`;
  }
  return null;
}
