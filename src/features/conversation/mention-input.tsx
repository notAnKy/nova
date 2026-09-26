"use client";

import { useRef, useState } from "react";
import type { Profile } from "@/features/profile/profile";
import { type MentionSpan, updateMentionSpans } from "./mentions";

type Query = { start: number; end: number; text: string };

function findQuery(value: string, caret: number): Query | null {
  const match = value.slice(0, caret).match(/(^|[\s([{])@([^\s@]*)$/);
  return match ? { start: caret - match[2].length - 1, end: caret, text: match[2] } : null;
}

export function MentionInput({ id, value, spans, onChange, eligible, onSubmit, disabled, rows,
  placeholder, describedBy, onPaste }: {
  id: string; value: string; spans: MentionSpan[];
  onChange: (value: string, spans: MentionSpan[]) => void;
  eligible: Profile[]; onSubmit: () => void; disabled?: boolean; rows?: number;
  placeholder?: string; describedBy?: string;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<Query | null>(null);
  const [active, setActive] = useState(0);
  const suggestions = query === null ? [] : eligible
    .filter((person) => person.display_name.toLocaleLowerCase().includes(query.text.toLocaleLowerCase()))
    .slice(0, 8);
  const menuId = `${id}-mentions`;

  function refreshQuery(value: string, caret: number) {
    setQuery(findQuery(value, caret));
    setActive(0);
  }

  function choose(person: Profile) {
    if (!query) return;
    const visible = `@${person.display_name}`;
    const following = value[query.end];
    const trailing = !following || !/[\s.,!?;:)\]}]/.test(following) ? " " : "";
    const next = value.slice(0, query.start) + visible + trailing + value.slice(query.end);
    const remaining = updateMentionSpans(value, next, spans);
    onChange(next, [...remaining, { start: query.start, end: query.start + visible.length, userId: person.user_id }]);
    setQuery(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      const caret = query.start + visible.length + trailing.length;
      input.current?.setSelectionRange(caret, caret);
    });
  }

  return <div className="mention-input">
    <textarea ref={input} id={id} role="combobox" value={value} rows={rows} maxLength={4000}
      onPaste={onPaste}
      disabled={disabled} placeholder={placeholder} aria-describedby={describedBy}
      aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={query !== null}
      aria-controls={query !== null ? menuId : undefined}
      aria-activedescendant={query !== null && suggestions.length ? `${menuId}-${active}` : undefined}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next, updateMentionSpans(value, next, spans));
        refreshQuery(next, event.target.selectionStart);
      }}
      onClick={(event) => refreshQuery(value, event.currentTarget.selectionStart)}
      onKeyUp={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          refreshQuery(value, event.currentTarget.selectionStart);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (query !== null) {
          if (event.key === "Escape") { event.preventDefault(); setQuery(null); return; }
          if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
            return;
          }
          if (suggestions.length && (event.key === "Enter" || event.key === "Tab")) {
            event.preventDefault(); choose(suggestions[active] ?? suggestions[0]); return;
          }
        }
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(); }
      }} />
    {query !== null && <div id={menuId} className="mention-suggestions" role="listbox" aria-label="Mention a person">
      {suggestions.length ? suggestions.map((person, index) =>
        <button key={person.user_id} id={`${menuId}-${index}`} type="button" role="option"
          aria-selected={index === active} className={index === active ? "is-active" : ""}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(person)}>
          <span className="mention-suggestions__name">{person.display_name}</span>
          {person.status_text && <small>{person.status_text}</small>}
        </button>) : <p>No matching participants</p>}
    </div>}
  </div>;
}
