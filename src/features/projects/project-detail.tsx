"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardList, Gavel, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MessageTimestamp } from "@/features/conversation/message-timestamp";
import type { Workspace, WorkspaceMember, WorkspaceRole } from "@/features/workspaces/types";
import type { Project, ProjectActivity, ProjectDecision, ProjectTask, SourceContext } from "./types";
import { pageHref } from "./pagination";

type ProjectPages = { tasks: number; decisions: number; activity: number };

function SectionPages({ path, pages, section, hasMore }: {
  path: string; pages: ProjectPages; section: keyof ProjectPages; hasMore: boolean;
}) {
  const current = pages[section];
  if (current === 1 && !hasMore) return null;
  return <nav className="phase9-pagination" aria-label={`${section} pages`}>
    {current > 1 && <Link href={pageHref(path, { ...pages, [section]: current - 1 }, section)}>Previous {section}</Link>}
    <span>Page {current}</span>
    {hasMore && <Link href={pageHref(path, { ...pages, [section]: current + 1 }, section)}>Next {section}</Link>}
  </nav>;
}

function SourceLink({ id, sources }: { id: string | null; sources: Record<string, SourceContext> }) {
  if (!id) return null;
  const source = sources[id];
  return source ? <Link href={source.url} className="phase8-source">
    Source: {source.label} · {source.author} · <MessageTimestamp iso={source.createdAt} />
  </Link> : <span className="phase8-source is-unavailable">Source message unavailable</span>;
}

const eventNames: Record<string, string> = {
  project_created: "created the project", task_created: "created a task",
  task_completed: "completed a task", task_reopened: "reopened a task",
  task_assigned: "changed a task assignment", decision_created: "recorded a decision",
};

export function ProjectDetail({ workspace, project, role, currentUserId, members,
  tasks, decisions, activity, sources, pages, hasMoreTasks, hasMoreDecisions, hasMoreActivity }: {
  workspace: Workspace; project: Project; role: WorkspaceRole; currentUserId: string;
  members: WorkspaceMember[]; tasks: ProjectTask[]; decisions: ProjectDecision[];
  activity: ProjectActivity[]; sources: Record<string, SourceContext>; pages: ProjectPages;
  hasMoreTasks: boolean; hasMoreDecisions: boolean; hasMoreActivity: boolean;
}) {
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = project.status === "active";
  const leader = role === "owner" || role === "admin";
  const canEditProject = leader || project.created_by === currentUserId;
  const people = new Map(members.map((member) => [member.user_id,
    member.profile?.display_name ?? "Member"]));
  const byTask = new Map(tasks.map((task) => [task.id, task.title]));
  const byDecision = new Map(decisions.map((decision) => [decision.id, decision.title]));
  const pagePath = `/w/${workspace.slug}/projects/${project.slug}`;

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const status = String(form.get("status") ?? "");
    if (name.length < 2 || name.length > 100 || description.length > 2000
      || !["active", "archived"].includes(status)) { setError("Check project details."); return; }
    setBusy("project"); setError("");
    const { error: saveError } = await db.from("projects").update({ name, description, status }).eq("id", project.id);
    setBusy("");
    if (saveError) { setError("Could not update project."); return; }
    setNotice("Project updated."); router.refresh();
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const assignee = String(form.get("assignee") ?? "");
    const due = String(form.get("due") ?? "");
    if (title.length < 2 || title.length > 180 || description.length > 4000) {
      setError("Use a task title of 2–180 characters."); return;
    }
    setBusy("task"); setError("");
    const { error: saveError } = await db.from("project_tasks").insert({ project_id: project.id,
      title, description, assignee_id: assignee || null, due_at: due ? new Date(due).toISOString() : null });
    setBusy("");
    if (saveError) { setError("Could not create task. Check the assignee and project access."); return; }
    formElement.reset(); setNotice("Task created.");
    if (pages.tasks > 1) router.push(pageHref(pagePath, { ...pages, tasks: 1 }, "tasks"));
    else router.refresh();
  }

  async function updateTask(task: ProjectTask, changes: Record<string, string | null>) {
    setBusy(task.id); setError("");
    const { error: saveError } = await db.from("project_tasks").update(changes).eq("id", task.id);
    setBusy("");
    if (saveError) { setError("Could not update task. Check your permissions and assignee."); return; }
    setNotice("Task updated.");
    if (pages.tasks > 1) router.push(pageHref(pagePath, { ...pages, tasks: 1 }, "tasks"));
    else router.refresh();
  }

  function editTask(event: React.FormEvent<HTMLFormElement>, task: ProjectTask) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const assignee = String(form.get("assignee") ?? "");
    if (title.length < 2 || title.length > 180 || description.length > 4000) {
      setError("Check the task title and description."); return;
    }
    const changes: Record<string, string | null> = { title, description };
    if (leader || task.created_by === currentUserId) changes.assignee_id = assignee || null;
    const due = String(form.get("due") ?? "");
    if (due) changes.due_at = new Date(due).toISOString();
    if (form.get("clear_due")) changes.due_at = null;
    void updateTask(task, changes);
  }

  async function createDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (title.length < 2 || title.length > 180 || body.length < 2 || body.length > 4000) {
      setError("Add a title and a concise decision."); return;
    }
    setBusy("decision"); setError("");
    const { error: saveError } = await db.from("project_decisions")
      .insert({ project_id: project.id, title, body });
    setBusy("");
    if (saveError) { setError("Could not record decision."); return; }
    formElement.reset(); setNotice("Decision recorded.");
    if (pages.decisions > 1) router.push(pageHref(pagePath, { ...pages, decisions: 1 }, "decisions"));
    else router.refresh();
  }

  return <div className="home-preview phase8-page phase8-detail">
    <Link href={`/w/${workspace.slug}/projects`} className="phase8-back"><ArrowLeft size={16} /> All projects</Link>
    <div className="home-preview__eyebrow">{workspace.name.toUpperCase()} / PROJECTS</div>
    <div className="phase8-title-row"><h1>{project.name}<span className="home-preview__period">.</span></h1>
      <span className={`phase8-status ${!active ? "is-muted" : ""}`}>{project.status}</span></div>
    <p className="home-preview__lede">{project.description || "A place for this team’s tasks and decisions."}</p>
    <nav className="phase8-anchor-nav" aria-label="Project sections">
      <a href="#overview">Overview</a><a href="#tasks">Tasks</a><a href="#decisions">Decisions</a><a href="#project-activity">Activity</a>
    </nav>
    {(error || notice) && <p className={`workspace-feedback ${error ? "is-error" : ""}`} role="status">{error || notice}</p>}
    <section id="overview" className="phase8-section"><div className="phase8-section__head"><h2>Overview</h2>
      <span>Tasks and decisions below</span></div>
      <p>Created <MessageTimestamp iso={project.created_at} /> · Updated <MessageTimestamp iso={project.updated_at} /></p>
      {canEditProject && <details className="phase8-create"><summary className="small-action">Edit project</summary>
        <form className="phase8-form" onSubmit={(event) => void saveProject(event)}>
          <label>Name<input name="name" required maxLength={100} defaultValue={project.name} /></label>
          <label>Description<textarea name="description" rows={3} maxLength={2000} defaultValue={project.description} /></label>
          <label>Status<select name="status" defaultValue={project.status}><option value="active">Active</option>
            <option value="archived">Archived</option></select></label>
          <button className="workspace-submit" disabled={busy === "project"}>Save project</button>
        </form>
      </details>}
    </section>
    <section id="tasks" className="phase8-section"><div className="phase8-section__head"><h2>Tasks</h2>
      <span>Simple work tracking</span></div>
      {active && <details className="phase8-create"><summary className="small-action"><Plus size={15} /> New task</summary>
        <form className="phase8-form" onSubmit={(event) => void createTask(event)}>
          <label>Title<input name="title" required maxLength={180} /></label>
          <label>Description<textarea name="description" rows={3} maxLength={4000} /></label>
          <label>Assignee<select name="assignee"><option value="">Unassigned</option>{members.map((member) =>
            <option key={member.user_id} value={member.user_id}>{member.profile?.display_name ?? "Member"}</option>)}</select></label>
          <label>Due date and time (optional)<input type="datetime-local" name="due" /></label>
          <button className="workspace-submit" disabled={busy === "task"}>Create task</button>
        </form>
      </details>}
      {!tasks.length && <p className="phase7-status">No tasks yet.</p>}
      <div className="phase8-items">{tasks.map((task) => {
        const canEdit = active && (leader || task.created_by === currentUserId || task.assignee_id === currentUserId);
        const canReassign = leader || task.created_by === currentUserId;
        return <article key={task.id} className="phase8-item">
          <div className="phase8-item__icon"><ClipboardList size={18} /></div>
          <div className="phase8-item__body"><div className="phase8-item__heading"><h3>{task.title}</h3>
            <span className={`phase8-status ${task.status === "done" ? "is-done" : ""}`}>{task.status.replace("_", " ")}</span></div>
            {task.description && <p>{task.description}</p>}
            <div className="phase8-item__meta"><span>{task.assignee_id ? people.get(task.assignee_id) ?? "Former member" : "Unassigned"}</span>
              {task.due_at && <span>Due <MessageTimestamp iso={task.due_at} /></span>}</div>
            <SourceLink id={task.source_message_id} sources={sources} />
            {canEdit && <div className="phase8-item__controls"><label>Status <select defaultValue={task.status}
              disabled={busy === task.id} onChange={(event) => void updateTask(task, { status: event.target.value })}>
              <option value="todo">To do</option><option value="in_progress">In progress</option>
              <option value="done">Done</option></select></label>
              <details className="phase8-inline-edit"><summary className="small-action">Edit</summary>
                <form className="phase8-form" onSubmit={(event) => editTask(event, task)}>
                  <label>Title<input name="title" required maxLength={180} defaultValue={task.title} /></label>
                  <label>Description<textarea name="description" rows={3} maxLength={4000} defaultValue={task.description} /></label>
                  <label>Assignee<select name="assignee" defaultValue={task.assignee_id ?? ""}
                    disabled={!canReassign}><option value="">Unassigned</option>
                    {members.map((member) => <option key={member.user_id} value={member.user_id}>
                      {member.profile?.display_name ?? "Member"}</option>)}</select></label>
                  <label>New due date/time<input type="datetime-local" name="due" /></label>
                  <label className="phase8-check"><input type="checkbox" name="clear_due" /> Clear due date</label>
                  <button className="workspace-submit" disabled={busy === task.id}>Save task</button>
                </form>
              </details></div>}
          </div>
        </article>;
      })}</div>
      <SectionPages path={pagePath} pages={pages} section="tasks" hasMore={hasMoreTasks} />
    </section>
    <section id="decisions" className="phase8-section"><div className="phase8-section__head"><h2>Decisions</h2>
      <span>Outcomes worth keeping</span></div>
      {active && <details className="phase8-create"><summary className="small-action"><Plus size={15} /> Record decision</summary>
        <form className="phase8-form" onSubmit={(event) => void createDecision(event)}>
          <label>Title<input name="title" required maxLength={180} /></label>
          <label>Decision<textarea name="body" required rows={4} maxLength={4000} /></label>
          <button className="workspace-submit" disabled={busy === "decision"}>Record decision</button>
        </form>
      </details>}
      {!decisions.length && <p className="phase7-status">No decisions recorded yet.</p>}
      <div className="phase8-items">{decisions.map((decision) =>
        <article key={decision.id} className="phase8-item"><div className="phase8-item__icon"><Gavel size={18} /></div>
          <div className="phase8-item__body"><h3>{decision.title}</h3><p>{decision.body}</p>
            <div className="phase8-item__meta"><span>{people.get(decision.created_by) ?? "Former member"}</span>
              <span>Decided <MessageTimestamp iso={decision.decided_at} /></span></div>
            <SourceLink id={decision.source_message_id} sources={sources} /></div></article>)}</div>
      <SectionPages path={pagePath} pages={pages} section="decisions" hasMore={hasMoreDecisions} />
    </section>
    <section id="project-activity" className="phase8-section"><div className="phase8-section__head"><h2>Activity</h2>
      <span>Recent project changes</span></div>
      {!activity.length && <p className="phase7-status">No project activity yet.</p>}
      <ol className="phase8-activity">{activity.map((event) =>
        <li key={event.id}><Check size={15} /><span><strong>{people.get(event.actor_id) ?? "Former member"}</strong>
          {` ${eventNames[event.event] ?? "updated the project"}`}
          {event.task_id && byTask.has(event.task_id) ? ` · ${byTask.get(event.task_id)}` : ""}
          {event.decision_id && byDecision.has(event.decision_id) ? ` · ${byDecision.get(event.decision_id)}` : ""}</span>
          <MessageTimestamp iso={event.created_at} /></li>)}</ol>
      <SectionPages path={pagePath} pages={pages} section="activity" hasMore={hasMoreActivity} />
    </section>
  </div>;
}
