-- In the previous policy, bare created_by inside the project subquery resolved
-- to projects.created_by. A former project leader could edit another member's
-- task. Qualify the task owner explicitly in both UPDATE predicates.
drop policy "Responsible members edit active tasks" on public.project_tasks;
create policy "Responsible members edit active tasks" on public.project_tasks
for update to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_tasks.project_id and p.status = 'active'
    and (project_tasks.created_by = (select auth.uid())
      or project_tasks.assignee_id = (select auth.uid())
      or nova_private.can_manage_project_workspace(p.workspace_id))
))
with check (exists (
  select 1 from public.projects p
  where p.id = project_tasks.project_id and p.status = 'active'
    and (project_tasks.created_by = (select auth.uid())
      or project_tasks.assignee_id = (select auth.uid())
      or nova_private.can_manage_project_workspace(p.workspace_id))
));
