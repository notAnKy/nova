import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENT_BUCKET, cleanUpOwnAttachments, inspectFile, validateFileSelection } from "./attachment-files.ts";

export type UploadResult = { id: string } | { error: string };

export async function uploadMessageAttachments(db: SupabaseClient, conversationId: string,
  workspaceId: string, body: string, parentId: string | null, files: File[]): Promise<UploadResult> {
  const selectionError = validateFileSelection(files);
  if (selectionError) return { error: selectionError };
  if (!files.length) return { error: "Choose a file to attach." };
  const checked: { mime: string }[] = [];
  for (const file of files) {
    const content = await inspectFile(file);
    if (!content) return { error: `${file.name}: unsupported or mismatched file content.` };
    checked.push({ mime: content.mime });
  }
  const messageBody = body.trim() || (files.length === 1 ? "Shared a file" : "Shared files");
  if (messageBody.length > 4000) return { error: "Messages must be 4,000 characters or fewer." };

  const { data: message, error: messageError } = await db.from("messages").insert({
    conversation_id: conversationId, body: messageBody,
    ...(parentId ? { parent_message_id: parentId } : {}),
  }).select("id").single();
  if (messageError || !message) return { error: messageError?.message ?? "Message could not be sent." };

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const objectId = crypto.randomUUID();
      const path = `${workspaceId}/${conversationId}/${objectId}`;
      const { error: reserveError } = await db.rpc("reserve_attachment", {
        p_message_id: message.id, p_object_id: objectId, p_name: file.name,
        p_mime: checked[index].mime, p_size: file.size,
      });
      if (reserveError) throw new Error("Could not reserve attachment storage.");
      const { error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET)
        .upload(path, file, { contentType: checked[index].mime, upsert: false });
      if (uploadError) throw new Error("File upload failed. Check your access and try again.");
    }
    const { data, error } = await db.functions.invoke("finalize-attachments", {
      body: { messageId: message.id },
    });
    if (error || !data || data.id !== message.id) {
      let detail = typeof data?.error === "string" ? data.error : "File validation failed. Try again.";
      const context = (error as { context?: unknown } | null)?.context;
      if (context instanceof Response) {
        try {
          const response = await context.json();
          if (typeof response?.error === "string") detail = response.error;
        } catch { /* Keep the general error. */ }
      }
      throw new Error(detail);
    }
    return { id: message.id };
  } catch (error) {
    // The trigger queues anything not removed here; the hourly worker retries it.
    await db.from("messages").update({ deleted_at: new Date().toISOString() })
      .eq("id", message.id).is("deleted_at", null);
    await cleanUpOwnAttachments(db);
    return { error: error instanceof Error ? error.message : "File upload failed." };
  }
}
