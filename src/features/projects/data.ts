import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, ProjectActivity, ProjectDecision, ProjectTask, SourceContext } from "./types";

const projectFields = "id,workspace_id,name,slug,description,status,created_by,created_at,updated_at";
export const PROJECT_PAGE_SIZE = 40;
export const TASK_PAGE_SIZE = 50;
export const DECISION_PAGE_SIZE = 40;
export const ACTIVITY_PAGE_SIZE = 30;

export async function listProjects(db: SupabaseClient, workspaceId: string, page = 1) {
  const start = (page - 1) * PROJECT_PAGE_SIZE;
  const { data, error } = await db.from("projects").select(projectFields)
    .eq("workspace_id", workspaceId).order("updated_at", { ascending: false })
    .order("id", { ascending: false }).range(start, start + PROJECT_PAGE_SIZE);
  if (error) throw new Error("We couldn’t load projects.");
  return { projects: ((data ?? []) as Project[]).slice(0, PROJECT_PAGE_SIZE),
    hasMore: (data ?? []).length > PROJECT_PAGE_SIZE };
}

export async function getProject(db: SupabaseClient, workspaceId: string, slug: string) {
  const { data, error } = await db.from("projects").select(projectFields)
    .eq("workspace_id", workspaceId).eq("slug", slug).maybeSingle();
  if (error) throw new Error("We couldn’t load this project.");
  return data as Project | null;
}

export async function getProjectItems(db: SupabaseClient, projectId: string, workspaceSlug: string,
  pages = { tasks: 1, decisions: 1, activity: 1 }) {
  const taskStart = (pages.tasks - 1) * TASK_PAGE_SIZE;
  const decisionStart = (pages.decisions - 1) * DECISION_PAGE_SIZE;
  const activityStart = (pages.activity - 1) * ACTIVITY_PAGE_SIZE;
  const [taskResult, decisionResult, activityResult] = await Promise.all([
    db.from("project_tasks").select("id,project_id,title,description,status,assignee_id,created_by,source_message_id,due_at,created_at,updated_at,completed_at")
      .eq("project_id", projectId).order("updated_at", { ascending: false })
      .order("id", { ascending: false }).range(taskStart, taskStart + TASK_PAGE_SIZE),
    db.from("project_decisions").select("id,project_id,title,body,source_message_id,created_by,decided_at,created_at,updated_at")
      .eq("project_id", projectId).order("decided_at", { ascending: false })
      .order("id", { ascending: false }).range(decisionStart, decisionStart + DECISION_PAGE_SIZE),
    db.from("project_activity").select("id,project_id,actor_id,event,task_id,decision_id,created_at")
      .eq("project_id", projectId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(activityStart, activityStart + ACTIVITY_PAGE_SIZE),
  ]);
  if (taskResult.error || decisionResult.error || activityResult.error)
    throw new Error("We couldn’t load project items.");
  const hasMoreTasks = (taskResult.data ?? []).length > TASK_PAGE_SIZE;
  const hasMoreDecisions = (decisionResult.data ?? []).length > DECISION_PAGE_SIZE;
  const hasMoreActivity = (activityResult.data ?? []).length > ACTIVITY_PAGE_SIZE;
  const tasks = ((taskResult.data ?? []) as ProjectTask[]).slice(0, TASK_PAGE_SIZE);
  const decisions = ((decisionResult.data ?? []) as ProjectDecision[]).slice(0, DECISION_PAGE_SIZE);
  const activity = ((activityResult.data ?? []) as ProjectActivity[]).slice(0, ACTIVITY_PAGE_SIZE);
  const sourceIds = [...new Set([...tasks.map((row) => row.source_message_id),
    ...decisions.map((row) => row.source_message_id)].filter((id): id is string => !!id))];
  const sources: Record<string, SourceContext> = {};
  if (sourceIds.length) {
    const { data: messages, error: messageError } = await db.from("messages")
      .select("id,conversation_id,author_id,created_at,parent_message_id,deleted_at")
      .in("id", sourceIds).is("deleted_at", null);
    if (messageError) throw new Error("We couldn’t check source messages.");
    const visible = messages ?? [];
    if (visible.length) {
      const [conversations, profiles] = await Promise.all([
        db.from("conversations").select("id,kind,name,slug").in("id", [...new Set(visible.map((m) => m.conversation_id))]),
        db.from("profiles").select("user_id,display_name").in("user_id", [...new Set(visible.map((m) => m.author_id))]),
      ]);
      if (conversations.error || profiles.error) throw new Error("We couldn’t check source context.");
      const byConversation = new Map((conversations.data ?? []).map((row) => [row.id, row]));
      const byAuthor = new Map((profiles.data ?? []).map((row) => [row.user_id, row.display_name]));
      for (const message of visible) {
        const conversation = byConversation.get(message.conversation_id);
        if (!conversation) continue;
        const direct = conversation.kind === "direct" || conversation.kind === "group_direct";
        const base = direct ? `/w/${workspaceSlug}/dm/${conversation.id}`
          : `/w/${workspaceSlug}/c/${conversation.slug}`;
        const params = new URLSearchParams();
        if (message.parent_message_id) params.set("thread", message.parent_message_id);
        params.set("message", message.id);
        sources[message.id] = { messageId: message.id, url: `${base}?${params}`,
          label: direct ? "Direct message" : `#${conversation.name}`,
          author: byAuthor.get(message.author_id) ?? "Member", createdAt: message.created_at };
      }
    }
  }
  return { tasks, decisions, activity, sources, hasMoreTasks, hasMoreDecisions, hasMoreActivity };
}
