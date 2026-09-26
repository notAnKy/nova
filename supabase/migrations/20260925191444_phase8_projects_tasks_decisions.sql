-- Phase 8: workspace projects, lightweight tasks, decisions and bounded activity.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' and slug !~ '--'),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,slug)
);
create index projects_workspace_status on public.projects(workspace_id,status,updated_at desc);
alter table public.projects enable row level security;
revoke all on public.projects from public,anon,authenticated;
grant select on public.projects to authenticated;
grant insert (workspace_id,name,slug,description) on public.projects to authenticated;
grant update (name,description,status) on public.projects to authenticated;
create policy "Workspace members read projects" on public.projects for select to authenticated
using (nova_private.is_workspace_member(workspace_id));
create policy "Leaders create projects" on public.projects for insert to authenticated
with check (created_by = (select auth.uid()) and status = 'active'
  and nova_private.member_role(workspace_id) in ('owner','admin'));
create policy "Creator or leader edits projects" on public.projects for update to authenticated
using (nova_private.is_workspace_member(workspace_id) and
  (created_by = (select auth.uid()) or nova_private.member_role(workspace_id) in ('owner','admin')))
with check (nova_private.is_workspace_member(workspace_id) and
  (created_by = (select auth.uid()) or nova_private.member_role(workspace_id) in ('owner','admin')));

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  source_message_id uuid,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index project_tasks_project_status on public.project_tasks(project_id,status,updated_at desc);
create index project_tasks_assignee on public.project_tasks(assignee_id) where assignee_id is not null;
create index project_tasks_source on public.project_tasks(source_message_id) where source_message_id is not null;
alter table public.project_tasks enable row level security;
revoke all on public.project_tasks from public,anon,authenticated;
grant select on public.project_tasks to authenticated;
grant insert (project_id,title,description,assignee_id,source_message_id,due_at) on public.project_tasks to authenticated;
grant update (title,description,status,assignee_id,due_at) on public.project_tasks to authenticated;
create policy "Members read project tasks" on public.project_tasks for select to authenticated
using (exists (select 1 from public.projects p where p.id=project_id));
create policy "Members create active project tasks" on public.project_tasks for insert to authenticated
with check (created_by=(select auth.uid()) and status='todo' and exists
  (select 1 from public.projects p where p.id=project_id and p.status='active'));
create policy "Responsible members edit active tasks" on public.project_tasks for update to authenticated
using (exists (select 1 from public.projects p where p.id=project_id and p.status='active'
  and (created_by=(select auth.uid()) or assignee_id=(select auth.uid())
    or nova_private.member_role(p.workspace_id) in ('owner','admin'))))
with check (exists (select 1 from public.projects p where p.id=project_id and p.status='active'
  and (created_by=(select auth.uid()) or assignee_id=(select auth.uid())
    or nova_private.member_role(p.workspace_id) in ('owner','admin'))));

create table public.project_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  body text not null check (char_length(btrim(body)) between 2 and 4000),
  source_message_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_decisions_project_time on public.project_decisions(project_id,decided_at desc);
create index project_decisions_source on public.project_decisions(source_message_id) where source_message_id is not null;
alter table public.project_decisions enable row level security;
revoke all on public.project_decisions from public,anon,authenticated;
grant select on public.project_decisions to authenticated;
grant insert (project_id,title,body,source_message_id) on public.project_decisions to authenticated;
create policy "Members read project decisions" on public.project_decisions for select to authenticated
using (exists (select 1 from public.projects p where p.id=project_id));
create policy "Members record active project decisions" on public.project_decisions for insert to authenticated
with check (created_by=(select auth.uid()) and exists
  (select 1 from public.projects p where p.id=project_id and p.status='active'));

-- Invoker trigger validates references using the caller's message RLS. A source
-- cannot cross workspaces or point to a message the creator cannot read.
create function nova_private.validate_project_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_workspace uuid;
begin
  select p.workspace_id into v_workspace from public.projects p where p.id=new.project_id;
  if v_workspace is null then raise exception 'project_unavailable'; end if;
  if tg_table_name = 'project_tasks' and new.assignee_id is not null and not exists
    (select 1 from public.workspace_members wm where wm.workspace_id=v_workspace and wm.user_id=new.assignee_id)
    then raise exception 'assignee_not_in_workspace'; end if;
  if new.source_message_id is not null and not exists
    (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.id=new.source_message_id and m.deleted_at is null and c.workspace_id=v_workspace)
    then raise exception 'source_unavailable'; end if;
  return new;
end; $$;
create trigger validate_project_task before insert or update of assignee_id on public.project_tasks
for each row execute function nova_private.validate_project_item();
create trigger validate_project_decision before insert on public.project_decisions
for each row execute function nova_private.validate_project_item();

create function nova_private.touch_project_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'project_tasks' then
    if new.status='done' and old.status<>'done' then new.completed_at:=now(); end if;
    if new.status<>'done' then new.completed_at:=null; end if;
  end if;
  return new;
end; $$;
create trigger touch_project before update on public.projects
for each row execute function nova_private.touch_project_item();
create trigger touch_project_task before update on public.project_tasks
for each row execute function nova_private.touch_project_item();

-- Keep assignment current when a member leaves. Historical creator IDs remain.
create function nova_private.clear_departed_task_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.project_tasks t set assignee_id=null
  from public.projects p where p.id=t.project_id and p.workspace_id=old.workspace_id
    and t.assignee_id=old.user_id;
  return null;
end; $$;
create trigger clear_departed_task_assignee after delete on public.workspace_members
for each row execute function nova_private.clear_departed_task_assignee();

create table public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event text not null check (event in ('project_created','task_created','task_completed',
    'task_reopened','task_assigned','decision_created')),
  task_id uuid references public.project_tasks(id) on delete set null,
  decision_id uuid references public.project_decisions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_activity_recent on public.project_activity(project_id,created_at desc);
alter table public.project_activity enable row level security;
revoke all on public.project_activity from public,anon,authenticated;
grant select on public.project_activity to authenticated;
create policy "Members read project activity" on public.project_activity for select to authenticated
using (exists (select 1 from public.projects p where p.id=project_id));

create function nova_private.record_project_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='projects' and tg_op='INSERT' then
    insert into public.project_activity(project_id,actor_id,event)
    values(new.id,new.created_by,'project_created');
  elsif tg_table_name='project_tasks' and tg_op='INSERT' then
    insert into public.project_activity(project_id,actor_id,event,task_id)
    values(new.project_id,new.created_by,'task_created',new.id);
  elsif tg_table_name='project_tasks' and tg_op='UPDATE' and auth.uid() is not null then
    if new.status is distinct from old.status then
      insert into public.project_activity(project_id,actor_id,event,task_id)
      values(new.project_id,auth.uid(),case when new.status='done' then 'task_completed' else 'task_reopened' end,new.id);
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      insert into public.project_activity(project_id,actor_id,event,task_id)
      values(new.project_id,auth.uid(),'task_assigned',new.id);
    end if;
  elsif tg_table_name='project_decisions' and tg_op='INSERT' then
    insert into public.project_activity(project_id,actor_id,event,decision_id)
    values(new.project_id,new.created_by,'decision_created',new.id);
  end if;
  return null;
end; $$;
create trigger project_created_activity after insert on public.projects
for each row execute function nova_private.record_project_activity();
create trigger task_activity after insert or update on public.project_tasks
for each row execute function nova_private.record_project_activity();
create trigger decision_activity after insert on public.project_decisions
for each row execute function nova_private.record_project_activity();

revoke execute on function nova_private.validate_project_item(),nova_private.touch_project_item(),
  nova_private.clear_departed_task_assignee(),nova_private.record_project_activity()
  from public,anon,authenticated;
