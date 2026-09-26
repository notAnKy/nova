"use client";

import { useFormStatus } from "react-dom";

export function FormSubmit({ idle, pending = "Saving…", className = "workspace-submit", disabled = false }: {
  idle: string; pending?: string; className?: string; disabled?: boolean;
}) {
  const { pending: isPending } = useFormStatus();
  return <button className={className} type="submit" disabled={isPending || disabled} aria-busy={isPending}>{isPending ? pending : idle}</button>;
}
