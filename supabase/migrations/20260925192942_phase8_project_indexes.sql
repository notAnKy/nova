-- Match the bounded project-page ordering and cover deletion checks on FK sides.
drop index public.projects_workspace_status;
create index projects_workspace_recent on public.projects(workspace_id,updated_at desc);
drop index public.project_tasks_project_status;
create index project_tasks_project_recent on public.project_tasks(project_id,updated_at desc);

-- Source IDs are only fetched from already loaded project items, so they need
-- no reverse lookup index in V1.
drop index public.project_tasks_source;
drop index public.project_decisions_source;

create index projects_creator on public.projects(created_by);
create index project_tasks_creator on public.project_tasks(created_by);
create index project_decisions_creator on public.project_decisions(created_by);
create index project_activity_actor on public.project_activity(actor_id);
create index project_activity_task on public.project_activity(task_id) where task_id is not null;
create index project_activity_decision on public.project_activity(decision_id) where decision_id is not null;
