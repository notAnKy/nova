export async function removeQueuedAttachments(db, rows) {
  let removed = 0;
  let failed = 0;
  for (const { storage_path: path } of rows) {
    const { error: removeError } = await db.storage.from("conversation-attachments").remove([path]);
    if (removeError) { failed++; continue; }
    const { error: forgetError } = await db.rpc("forget_cleaned_attachment", { p_path: path });
    if (forgetError) failed++; else removed++;
  }
  return { removed, failed };
}
