-- Expose only a Boolean leadership check; the existing role lookup stays private.
create function nova_private.can_manage_project_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and nova_private.member_role(p_workspace_id) in ('owner','admin');
$$;
revoke execute on function nova_private.can_manage_project_workspace(uuid) from public,anon,authenticated;
grant execute on function nova_private.can_manage_project_workspace(uuid) to authenticated;

drop policy "Leaders create projects" on public.projects;
create policy "Leaders create projects" on public.projects for insert to authenticated
with check (created_by = (select auth.uid()) and status = 'active'
  and nova_private.can_manage_project_workspace(workspace_id));
drop policy "Creator or leader edits projects" on public.projects;
create policy "Creator or leader edits projects" on public.projects for update to authenticated
using (nova_private.is_workspace_member(workspace_id) and
  (created_by = (select auth.uid()) or nova_private.can_manage_project_workspace(workspace_id)))
with check (nova_private.is_workspace_member(workspace_id) and
  (created_by = (select auth.uid()) or nova_private.can_manage_project_workspace(workspace_id)));

drop policy "Responsible members edit active tasks" on public.project_tasks;
create policy "Responsible members edit active tasks" on public.project_tasks for update to authenticated
using (exists (select 1 from public.projects p where p.id=project_id and p.status='active'
  and (created_by=(select auth.uid()) or assignee_id=(select auth.uid())
    or nova_private.can_manage_project_workspace(p.workspace_id))))
with check (exists (select 1 from public.projects p where p.id=project_id and p.status='active'
  and (created_by=(select auth.uid()) or assignee_id=(select auth.uid())
    or nova_private.can_manage_project_workspace(p.workspace_id))));
