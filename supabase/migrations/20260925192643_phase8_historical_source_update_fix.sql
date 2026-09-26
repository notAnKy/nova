-- A source can become deleted or inaccessible after item creation. Assignment
-- changes must still work; source_message_id is not an updatable client column.
create or replace function nova_private.validate_project_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_workspace uuid;
begin
  select p.workspace_id into v_workspace from public.projects p where p.id=new.project_id;
  if v_workspace is null then raise exception 'project_unavailable'; end if;
  if tg_table_name = 'project_tasks' then
    if new.assignee_id is not null and not exists
      (select 1 from public.workspace_members wm where wm.workspace_id=v_workspace and wm.user_id=new.assignee_id)
      then raise exception 'assignee_not_in_workspace'; end if;
  end if;
  if tg_op = 'INSERT' and new.source_message_id is not null and not exists
    (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.id=new.source_message_id and m.deleted_at is null and c.workspace_id=v_workspace)
    then raise exception 'source_unavailable'; end if;
  return new;
end; $$;
