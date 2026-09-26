"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Layers3, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MessageTimestamp } from "@/features/conversation/message-timestamp";
import type { Workspace, WorkspaceRole } from "@/features/workspaces/types";
import type { Project } from "./types";
import { pageHref } from "./pagination";

function slugFromName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
}

export function ProjectList({ workspace, role, projects, page, hasMore }: {
  workspace: Workspace; role: WorkspaceRole; projects: Project[]; page: number; hasMore: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canCreate = role === "owner" || role === "admin";

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || name.trim().length < 2 || !/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug) || slug.includes("--")) {
      setError("Use a name and a URL slug of 3–48 lowercase letters, numbers, or hyphens."); return;
    }
    setBusy(true); setError("");
    const db = createClient();
    const { data, error: saveError } = await db.from("projects")
      .insert({ workspace_id: workspace.id, name: name.trim(), slug, description: description.trim() })
      .select("slug").single();
    setBusy(false);
    if (saveError || !data) { setError(saveError?.code === "23505" ? "That project URL is already in use." : "Could not create project."); return; }
    router.push(`/w/${workspace.slug}/projects/${data.slug}`);
  }

  return <div className="home-preview phase8-page">
    <div className="home-preview__eyebrow">WORKSPACE / PROJECTS</div>
    <h1>Projects<span className="home-preview__period">.</span></h1>
    <p className="home-preview__lede">Keep decisions and work connected to your conversations in {workspace.name}.</p>
    <div className="home-preview__rule" />
    <div className="home-preview__section-head"><div><h2>Workspace projects</h2>
      <p>Shared with current workspace members.</p></div></div>
    <div className="phase8-project-list">{projects.map((project) =>
      <Link key={project.id} href={`/w/${workspace.slug}/projects/${project.slug}`} className="phase8-project-row">
        <span className="home-preview__hash"><Layers3 size={18} /></span>
        <span className="phase8-project-row__copy"><strong>{project.name}</strong>
          <small>{project.description || "No description yet."}</small></span>
        <span className={`phase8-status ${project.status === "archived" ? "is-muted" : ""}`}>{project.status}</span>
        <small className="phase8-project-row__time">Updated <MessageTimestamp iso={project.updated_at} /></small>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>)}</div>
    {!projects.length && <p className="phase7-status">{page === 1 ? "No projects yet. Workspace leaders can create the first one." : "No projects on this page."}</p>}
    {(page > 1 || hasMore) && <nav className="phase9-pagination" aria-label="Project pages">
      {page > 1 && <Link href={pageHref(`/w/${workspace.slug}/projects`, { page: page - 1 })}>Previous projects</Link>}
      <span>Page {page}</span>
      {hasMore && <Link href={pageHref(`/w/${workspace.slug}/projects`, { page: page + 1 })}>Next projects</Link>}
    </nav>}
    {canCreate && <details className="phase8-create"><summary className="workspace-submit"><Plus size={16} /> New project</summary>
      <form onSubmit={(event) => void create(event)} className="phase8-form">
        <label>Project name<input required maxLength={100} value={name} onChange={(event) => {
          setName(event.target.value); if (!slugTouched) setSlug(slugFromName(event.target.value));
        }} /></label>
        <label>URL slug<input required maxLength={48} value={slug} onChange={(event) => {
          setSlugTouched(true); setSlug(event.target.value.toLowerCase());
        }} /></label>
        <label>Description<textarea rows={3} maxLength={2000} value={description}
          onChange={(event) => setDescription(event.target.value)} /></label>
        {error && <p className="workspace-feedback is-error" role="alert">{error}</p>}
        <button type="submit" className="workspace-submit" disabled={busy}>{busy ? "Creating…" : "Create project"}</button>
      </form>
    </details>}
  </div>;
}
