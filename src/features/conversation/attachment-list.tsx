"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Download, FileText, ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MessageAttachment } from "@/features/channels/types";
import { ATTACHMENT_BUCKET, formatFileSize } from "./attachment-files";

function expirationLabel(expiresAt: number, now: number) {
  const minutes = Math.max(1, Math.ceil((expiresAt - now) / 60_000));
  if (minutes >= 2880) return `Expires in ${Math.ceil(minutes / 1440)} days`;
  if (minutes >= 120) return `Expires in ${Math.ceil(minutes / 60)} hours`;
  if (minutes >= 60) return "Expires in 1 hour";
  return `Expires in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function Attachment({ item }: { item: MessageAttachment }) {
  const db = useMemo(() => createClient(), []);
  const element = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const image = item.mime_type.startsWith("image/");
  const expiresAt = Date.parse(item.expires_at);
  const expired = item.state === "expired" || (now !== null && now >= expiresAt);
  const active = now !== null && !expired;

  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const deadline = window.setTimeout(() => setNow(Date.now()),
      Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)));
    return () => { window.clearInterval(clock); window.clearTimeout(deadline); };
  }, [expiresAt]);

  useEffect(() => {
    if (!image || !active || !element.current) return;
    let mounted = true;
    let url: string | null = null;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void db.storage.from(ATTACHMENT_BUCKET).download(item.storage_path).then(({ data, error: loadError }) => {
        if (!mounted || Date.now() >= expiresAt) return;
        if (loadError || !data) { setError("Preview unavailable"); return; }
        url = URL.createObjectURL(data);
        setPreview(url);
      });
    }, { rootMargin: "300px" });
    observer.observe(element.current);
    return () => { mounted = false; observer.disconnect(); if (url) URL.revokeObjectURL(url); };
  }, [db, image, active, expiresAt, item.storage_path]);

  async function download() {
    if (item.state === "expired" || Date.now() >= expiresAt) return;
    setError("");
    const { data, error: loadError } = await db.storage.from(ATTACHMENT_BUCKET).download(item.storage_path);
    if (loadError || !data) { setError("File unavailable. Check your access and try again."); return; }
    if (Date.now() >= expiresAt) return;
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = item.original_name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="message-attachment" ref={element}>
    {active && image && preview && <Image unoptimized className="message-attachment__preview" src={preview}
      alt={item.original_name} width={800} height={450} />}
    <div className="message-attachment__row">
      <span className="message-attachment__icon">{image ? <ImageIcon size={18} /> : <FileText size={18} />}</span>
      <span className="message-attachment__info"><strong title={item.original_name}>{item.original_name}</strong>
        <small>{expired ? "Attachment expired" : `${formatFileSize(item.size_bytes)} · ${item.mime_type}`}</small>
        {active && now !== null && <small title={`Expires ${new Date(expiresAt).toLocaleString()}`}
          aria-label={`Attachment expires ${new Date(expiresAt).toLocaleString()}`}>
          {expirationLabel(expiresAt, now)}</small>}</span>
      {active && <button type="button" className="icon-button" aria-label={`Download ${item.original_name}`}
        onClick={() => void download()}><Download size={17} /></button>}
    </div>
    {error && <small role="status" className="message-attachment__error">{error}</small>}
  </div>;
}

export function AttachmentList({ items }: { items: MessageAttachment[] }) {
  if (!items.length) return null;
  return <div className="message-attachments" aria-label="Attachments">
    {items.map((item) => <Attachment key={item.id} item={item} />)}
  </div>;
}
