"use client";

import { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { Profile } from "@/features/profile/profile";
import { MentionInput } from "./mention-input";
import { encodeMentions, type MentionSpan } from "./mentions";
import { appendAttachmentFiles, formatFileSize, prepareClipboardFiles } from "./attachment-files";

export type MessageMutationResult = { ok: true } | { ok: false; error: string };

export function Composer({ conversationLabel, eligible, onSend, onDraftChange, onSent, disabled = false, id = "message-draft" }: {
  conversationLabel: string; eligible: Profile[];
  onSend: (body: string, files: File[]) => Promise<MessageMutationResult>; disabled?: boolean; id?: string;
  onDraftChange?: (value: string) => void; onSent?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [spans, setSpans] = useState<MentionSpan[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  function addFiles(selected: File[]) {
    const next = appendAttachmentFiles(files, selected);
    if (next.error) { setError(next.error); return; }
    setFiles(next.files);
    setError("");
  }

  async function send() {
    const body = encodeMentions(draft, spans).trim();
    if (sending || disabled || (!body && !files.length)) return;
    if (body.length > 4000) { setError("Messages must be 4,000 characters or fewer."); return; }
    setSending(true);
    setError("");
    try {
      const result = await onSend(body, files);
      if (result.ok) { setDraft(""); setSpans([]); setFiles([]); onSent?.(); if (fileInput.current) fileInput.current.value = ""; }
      else setError(result.error);
    } catch { setError("We couldn’t send this message. Your draft is still here."); }
    finally { setSending(false); }
  }

  return <div className="composer-wrap">
    <div className="composer" aria-label={`Message composer for ${conversationLabel}`}>
      <label className="sr-only" htmlFor={id}>Message {conversationLabel}</label>
      <MentionInput id={id} value={draft} spans={spans} eligible={eligible}
        onChange={(value, nextSpans) => { setDraft(value); setSpans(nextSpans); onDraftChange?.(value); }} onSubmit={() => void send()}
        onPaste={(event) => {
          const clipboard = event.clipboardData;
          const selected = Array.from(clipboard.files.length ? clipboard.files :
            Array.from(clipboard.items).filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter((file): file is File => !!file));
          if (!selected.length) return;
          event.preventDefault();
          const prepared = prepareClipboardFiles(selected);
          if (prepared.error) { setError(prepared.error); return; }
          addFiles(prepared.files);
        }}
        placeholder={disabled ? "You can’t send to this conversation" : `Message ${conversationLabel}`}
        rows={3} disabled={disabled || sending} describedBy={`${id}-note`} />
      {files.length > 0 && <ul className="composer-files" aria-label="Selected files">{files.map((file, index) =>
        <li key={`${file.name}-${index}`}><Paperclip size={14} /><span title={file.name}>{file.name}</span>
          <small>{formatFileSize(file.size)}</small><button type="button" aria-label={`Remove ${file.name}`}
            disabled={sending} onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}><X size={15} /></button></li>)}</ul>}
      <div className="composer__toolbar"><div className="composer__tools">
        <input ref={fileInput} type="file" className="sr-only" multiple tabIndex={-1} aria-label="Choose files to attach"
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.csv,.json"
          disabled={disabled || sending} onChange={(event) => {
            addFiles(Array.from(event.target.files ?? [])); event.target.value = "";
          }} />
        <IconButton label="Attach files" disabled={disabled || sending} onClick={() => fileInput.current?.click()}><Paperclip size={17} /></IconButton>
      </div>
        <button type="button" className="composer__send" disabled={disabled || sending || (!draft.trim() && !files.length)} onClick={() => void send()}>
          <Send size={16} aria-hidden="true" /><span>{sending ? (files.length ? "Uploading…" : "Sending…") : "Send"}</span>
        </button>
      </div>
    </div>
    <p className="composer-note" id={`${id}-note`}>Enter to send · Shift+Enter for a new line · Type @ to mention someone</p>
    {error && <p className="workspace-feedback is-error" role="alert">{error}</p>}
  </div>;
}
