"use client";

import { useState } from "react";
import { Bold, Code2, Paperclip, Send, Smile } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

export function Composer({ conversationName, isThread = false }: { conversationName: string; isThread?: boolean }) {
  const [draft, setDraft] = useState("");
  return (
    <div className={`composer-wrap ${isThread ? "composer-wrap--thread" : ""}`}>
      <div className="composer" aria-label="Message composer preview">
        <label className="sr-only" htmlFor={isThread ? "thread-draft" : "message-draft"}>Draft message for {conversationName}</label>
        <textarea id={isThread ? "thread-draft" : "message-draft"} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={isThread ? "Reply in thread…" : `Message ${conversationName}`} rows={isThread ? 2 : 3} aria-describedby={isThread ? "thread-composer-note" : "composer-note"} />
        <div className="composer__toolbar">
          <div className="composer__tools">
            <IconButton label="Formatting — available with messaging" disabled><Bold size={17} /></IconButton>
            <IconButton label="Insert code — available with messaging" disabled><Code2 size={17} /></IconButton>
            <span className="composer__separator" aria-hidden="true" />
            <IconButton label="Attach file — available in Phase 7" disabled><Paperclip size={17} /></IconButton>
            <IconButton label="Add emoji — available with messaging" disabled><Smile size={17} /></IconButton>
          </div>
          <button type="button" className="composer__send" disabled aria-label="Send message — available in Phase 4" title="Sending arrives in Phase 4"><Send size={16} aria-hidden="true" /><span>Send</span></button>
        </div>
      </div>
      <p className="composer-note" id={isThread ? "thread-composer-note" : "composer-note"}>Preview only · Drafts are not saved or sent.</p>
    </div>
  );
}
