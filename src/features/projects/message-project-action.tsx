"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "./types";

type MemberChoice = { user_id: string; name: string };

export function MessageProjectAction({ workspaceId, messageId }: { workspaceId: string; messageId: string }) {
  const db = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const workspaceSlug = pathname.split("/")[2] ?? "";
  const [kind, setKind] = useState<"task" | "decision" | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<MemberChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Project | null>(null);

  async function open(next: "task" | "decision") {
    setKind(next); setError(""); setCreated(null); setLoading(true);
    const [projectResult, rosterResult] = await Promise.all([
      db.from("projects").select("id,workspace_id,name,slug,description,status,created_by,created_at,updated_at")
        .eq("workspace_id", workspaceId).eq("status", "active").order("name").limit(100),
      db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId),
    ]);
    if (projectResult.error || rosterResult.error) { setError("Could not load projects or members."); setLoading(false); return; }
    const userIds = (rosterResult.data ?? []).map((row) => row.user_id);
    const profileResult = userIds.length ? await db.from("profiles").select("user_id,display_name").in("user_id", userIds)
      : { data: [], error: null };
    if (profileResult.error) { setError("Could not load members."); setLoading(false); return; }
    const byId = new Map((profileResult.data ?? []).map((row) => [row.user_id, row.display_name]));
    setProjects((projectResult.data ?? []) as Project[]);
    setMembers(userIds.map((user_id) => ({ user_id, name: byId.get(user_id) ?? "Member" })));
    setLoading(false);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    const project = projects.find((row) => row.id === form.get("project"));
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (!project || title.length < 2 || title.length > 180 || (kind === "decision" && body.length < 2)) {
      setError("Choose a project and add a clear title and decision."); return;
    }
    setBusy(true); setError("");
    const { error: saveError } = kind === "task"
      ? await db.from("project_tasks").insert({ project_id: project.id, title, description: body,
        assignee_id: String(form.get("assignee") ?? "") || null, source_message_id: messageId })
      : await db.from("project_decisions").insert({ project_id: project.id, title, body, source_message_id: messageId });
    setBusy(false);
    if (saveError) { setError("Could not create this item. Check your project and message access."); return; }
    setCreated(project);
  }

  return <div className="phase8-message-action">
    <details><summary className="icon-button" title="Create task or decision" aria-label="Create task or decision">
      <ClipboardPlus size={16} /></summary>
      <div className="phase8-message-menu"><button type="button" onClick={() => void open("task")}>Create task</button>
        <button type="button" onClick={() => void open("decision")}>Create decision</button></div>
    </details>
    {kind && <div className="phase8-message-panel" role="group" aria-label={`Create ${kind} from message`}>
      <div className="phase8-message-panel__head"><strong>Create {kind}</strong>
        <button type="button" className="icon-button" aria-label="Close project item form" onClick={() => setKind(null)}><X size={15} /></button></div>
      {loading ? <p>Loading projects…</p> : created
        ? <p>Created in <Link href={`/w/${workspaceSlug}/projects/${created.slug}`}>{created.name}</Link>.</p>
        : <form className="phase8-form" onSubmit={(event) => void create(event)}>
          {!projects.length && <p>No active projects available.</p>}
          <label>Project<select name="project" required><option value="">Choose a project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label>Title<input name="title" required maxLength={180} /></label>
          <label>{kind === "task" ? "Description (optional)" : "Decision"}<textarea name="body" rows={3}
            required={kind === "decision"} maxLength={4000} /></label>
          {kind === "task" && <label>Assignee<select name="assignee"><option value="">Unassigned</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>}
          <small>Source linked. Message text is not copied.</small>
          {error && <p className="workspace-feedback is-error" role="alert">{error}</p>}
          <button type="submit" className="workspace-submit" disabled={busy || !projects.length}>Create {kind}</button>
        </form>}
      {error && (loading || created) && <p className="workspace-feedback is-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
