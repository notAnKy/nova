-- Only a transition out of Done is a reopen. To do -> In progress stays quiet.
create or replace function nova_private.record_project_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='projects' and tg_op='INSERT' then
    insert into public.project_activity(project_id,actor_id,event)
    values(new.id,new.created_by,'project_created');
  elsif tg_table_name='project_tasks' and tg_op='INSERT' then
    insert into public.project_activity(project_id,actor_id,event,task_id)
    values(new.project_id,new.created_by,'task_created',new.id);
  elsif tg_table_name='project_tasks' and tg_op='UPDATE' and auth.uid() is not null then
    if new.status='done' and old.status<>'done' then
      insert into public.project_activity(project_id,actor_id,event,task_id)
      values(new.project_id,auth.uid(),'task_completed',new.id);
    elsif old.status='done' and new.status<>'done' then
      insert into public.project_activity(project_id,actor_id,event,task_id)
      values(new.project_id,auth.uid(),'task_reopened',new.id);
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
