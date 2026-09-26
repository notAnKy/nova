-- Transactional test: demoted project creator cannot edit another user's task.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at) values
 ('91919191-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9-owner@example.invalid','',now()),
 ('92929292-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9-project@example.invalid','',now()),
 ('93939393-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9-task@example.invalid','',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','91919191-1111-4111-8111-111111111111',true);
select set_config('p9.workspace',public.create_workspace('Phase 9 checks','phase9-checks')->>'id',true);
select set_config('p9.invite_project',public.create_workspace_invitation(current_setting('p9.workspace')::uuid,'admin',24,1)->>'token',true);
select set_config('p9.invite_task',public.create_workspace_invitation(current_setting('p9.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('request.jwt.claim.sub','92929292-2222-4222-8222-222222222222',true);
select public.accept_workspace_invitation(current_setting('p9.invite_project'));
with p as (insert into public.projects(workspace_id,name,slug) values
 (current_setting('p9.workspace')::uuid,'Project','phase9-project') returning id)
select set_config('p9.project',id::text,true) from p;
select set_config('request.jwt.claim.sub','93939393-3333-4333-8333-333333333333',true);
select public.accept_workspace_invitation(current_setting('p9.invite_task'));
with t as (insert into public.project_tasks(project_id,title) values
 (current_setting('p9.project')::uuid,'Member task') returning id)
select set_config('p9.task',id::text,true) from t;
update public.project_tasks set status='in_progress' where id=current_setting('p9.task')::uuid;
select set_config('request.jwt.claim.sub','91919191-1111-4111-8111-111111111111',true);
select public.change_workspace_member_role(current_setting('p9.workspace')::uuid,
  '92929292-2222-4222-8222-222222222222'::uuid,'member');
select set_config('request.jwt.claim.sub','92929292-2222-4222-8222-222222222222',true);
do $$ declare changed integer; begin
  update public.project_tasks set status='done' where id=current_setting('p9.task')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Demoted project creator edited another member task'; end if;
end $$;
select set_config('request.jwt.claim.sub','93939393-3333-4333-8333-333333333333',true);
update public.project_tasks set status='done' where id=current_setting('p9.task')::uuid;
do $$ begin
 if (select status from public.project_tasks where id=current_setting('p9.task')::uuid) <> 'done'
   then raise exception 'Task creator lost edit access'; end if;
end $$;
select set_config('request.jwt.claim.sub','91919191-1111-4111-8111-111111111111',true);
update public.project_tasks set status='todo' where id=current_setting('p9.task')::uuid;
do $$ begin
 if (select status from public.project_tasks where id=current_setting('p9.task')::uuid) <> 'todo'
   then raise exception 'Workspace owner lost task edit access'; end if;
end $$;
rollback;
