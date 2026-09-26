export type Project = {
  id: string; workspace_id: string; name: string; slug: string; description: string;
  status: "active" | "archived"; created_by: string; created_at: string; updated_at: string;
};

export type ProjectTask = {
  id: string; project_id: string; title: string; description: string;
  status: "todo" | "in_progress" | "done"; assignee_id: string | null;
  created_by: string; source_message_id: string | null; due_at: string | null;
  created_at: string; updated_at: string; completed_at: string | null;
};

export type ProjectDecision = {
  id: string; project_id: string; title: string; body: string; source_message_id: string | null;
  created_by: string; decided_at: string; created_at: string; updated_at: string;
};

export type ProjectActivity = {
  id: string; project_id: string; actor_id: string; event: string;
  task_id: string | null; decision_id: string | null; created_at: string;
};

export type SourceContext = {
  messageId: string; url: string; label: string; author: string; createdAt: string;
};
