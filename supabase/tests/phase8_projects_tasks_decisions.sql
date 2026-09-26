-- Transactional Phase 8 authorization and source-privacy checks. No rows persist.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at) values
 ('a8a8a8a8-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase8-a@example.invalid','',now()),
 ('b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase8-b@example.invalid','',now()),
 ('c8c8c8c8-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase8-c@example.invalid','',now()),
 ('d8d8d8d8-dddd-4ddd-8ddd-ddddddddddd4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase8-d@example.invalid','',now()),
 ('e8e8e8e8-eeee-4eee-8eee-eeeeeeeeeee5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase8-e@example.invalid','',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','a8a8a8a8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p8.workspace',public.create_workspace('Phase 8 checks','phase8-checks')->>'id',true);
select set_config('p8.other_workspace',public.create_workspace('Phase 8 other','phase8-other')->>'id',true);
select set_config('p8.public',public.create_channel(current_setting('p8.workspace')::uuid,'General','general','', 'public_channel')->>'id',true);
select set_config('p8.private',public.create_channel(current_setting('p8.workspace')::uuid,'Secret','secret','', 'private_channel')->>'id',true);
select set_config('p8.other_channel',public.create_channel(current_setting('p8.other_workspace')::uuid,'Other','other','', 'public_channel')->>'id',true);
select set_config('p8.invite_b',public.create_workspace_invitation(current_setting('p8.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p8.invite_c',public.create_workspace_invitation(current_setting('p8.workspace')::uuid,'admin',24,1)->>'token',true);
select set_config('p8.invite_d',public.create_workspace_invitation(current_setting('p8.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('request.jwt.claim.sub','b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
select public.accept_workspace_invitation(current_setting('p8.invite_b'));
select set_config('request.jwt.claim.sub','c8c8c8c8-cccc-4ccc-8ccc-ccccccccccc3',true);
select public.accept_workspace_invitation(current_setting('p8.invite_c'));
select set_config('request.jwt.claim.sub','d8d8d8d8-dddd-4ddd-8ddd-ddddddddddd4',true);
select public.accept_workspace_invitation(current_setting('p8.invite_d'));
select set_config('request.jwt.claim.sub','a8a8a8a8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p8.dm',public.create_or_get_direct(current_setting('p8.workspace')::uuid,
  'b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid)->>'id',true);
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p8.public')::uuid,'Public project source') returning id)
select set_config('p8.public_msg',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p8.private')::uuid,'Private project source') returning id)
select set_config('p8.private_msg',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p8.dm')::uuid,'Secret DM source') returning id)
select set_config('p8.dm_msg',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p8.other_channel')::uuid,'Other workspace source') returning id)
select set_config('p8.other_msg',id::text,true) from m;
with p as (insert into public.projects(workspace_id,name,slug,description) values
 (current_setting('p8.workspace')::uuid,'Riftbound Survivors','riftbound-survivors','Game project') returning id)
select set_config('p8.project',id::text,true) from p;
do $$ begin
 if (select created_by from public.projects where id=current_setting('p8.project')::uuid)<>auth.uid()
   or not exists(select 1 from public.project_activity where project_id=current_setting('p8.project')::uuid
     and event='project_created') then raise exception 'owner project creation or activity failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','c8c8c8c8-cccc-4ccc-8ccc-ccccccccccc3',true);
with p as (insert into public.projects(workspace_id,name,slug) values
 (current_setting('p8.workspace')::uuid,'Admin Project','admin-project') returning id)
select set_config('p8.admin_project',id::text,true) from p;
update public.projects set status='archived' where id=current_setting('p8.admin_project')::uuid;
select set_config('request.jwt.claim.sub','b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ declare denied boolean:=false; begin
 begin insert into public.projects(workspace_id,name,slug) values
  (current_setting('p8.workspace')::uuid,'Unauthorized','unauthorized');
 exception when others then denied:=true; end;
 if not denied then raise exception 'ordinary member created project'; end if;
 if (select count(*) from public.projects where workspace_id=current_setting('p8.workspace')::uuid)<>2
   then raise exception 'member cannot read active and archived projects'; end if;
end $$;
with t as (insert into public.project_tasks(project_id,title,assignee_id,source_message_id) values
 (current_setting('p8.project')::uuid,'Increase spawn delay',
  'b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,current_setting('p8.public_msg')::uuid) returning id)
select set_config('p8.task',id::text,true) from t;
do $$ declare denied boolean:=false; begin
 if (select created_by from public.project_tasks where id=current_setting('p8.task')::uuid)<>auth.uid()
   then raise exception 'task creator spoofed'; end if;
 begin insert into public.project_tasks(project_id,title,assignee_id) values
  (current_setting('p8.project')::uuid,'Outsider assignment',
   'e8e8e8e8-eeee-4eee-8eee-eeeeeeeeeee5'::uuid);
 exception when others then denied:=true; end;
 if not denied then raise exception 'outsider assignment accepted'; end if;
 denied:=false;
 begin update public.project_tasks set assignee_id='e8e8e8e8-eeee-4eee-8eee-eeeeeeeeeee5'::uuid
   where id=current_setting('p8.task')::uuid;
 exception when others then denied:=true; end;
 if not denied then raise exception 'outsider reassignment accepted'; end if;
 denied:=false;
 begin insert into public.project_tasks(project_id,title,source_message_id) values
  (current_setting('p8.project')::uuid,'Cross workspace',current_setting('p8.other_msg')::uuid);
 exception when others then denied:=true; end;
 if not denied then raise exception 'cross-workspace source accepted'; end if;
 denied:=false;
 begin insert into public.project_tasks(project_id,title,source_message_id) values
  (current_setting('p8.project')::uuid,'Private unread',current_setting('p8.private_msg')::uuid);
 exception when others then denied:=true; end;
 if not denied then raise exception 'inaccessible private source accepted'; end if;
end $$;
update public.project_tasks set status='in_progress' where id=current_setting('p8.task')::uuid;
do $$ begin
 if exists(select 1 from public.project_activity where project_id=current_setting('p8.project')::uuid
   and event='task_reopened') then raise exception 'in-progress transition mislabeled as reopened'; end if;
end $$;
update public.project_tasks set status='done' where id=current_setting('p8.task')::uuid;
do $$ begin
 if (select completed_at from public.project_tasks where id=current_setting('p8.task')::uuid) is null
   then raise exception 'assignee could not complete task'; end if;
end $$;
select set_config('request.jwt.claim.sub','d8d8d8d8-dddd-4ddd-8ddd-ddddddddddd4',true);
do $$ begin
 if exists(select 1 from public.project_tasks where id=current_setting('p8.task')::uuid
   and source_message_id=current_setting('p8.private_msg')::uuid) then
   raise exception 'private source leaked into tasks'; end if;
 if not exists(select 1 from public.projects where id=current_setting('p8.admin_project')::uuid)
   then raise exception 'archived project not readable to member'; end if;
 if exists(select 1 from public.messages where id=current_setting('p8.dm_msg')::uuid)
   then raise exception 'DM source leaked to workspace member'; end if;
end $$;
update public.project_tasks set status='todo' where id=current_setting('p8.task')::uuid;
do $$ begin
 if (select status from public.project_tasks where id=current_setting('p8.task')::uuid)<>'done'
   then raise exception 'unrelated member updated task'; end if;
end $$;
select set_config('request.jwt.claim.sub','c8c8c8c8-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$ declare denied boolean:=false; begin
 begin insert into public.project_decisions(project_id,title,body,source_message_id) values
  (current_setting('p8.project')::uuid,'DM leak','No source body copied',current_setting('p8.dm_msg')::uuid);
 exception when others then denied:=true; end;
 if not denied then raise exception 'workspace admin linked unread DM source'; end if;
end $$;
select set_config('request.jwt.claim.sub','a8a8a8a8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
with d as (insert into public.project_decisions(project_id,title,body,source_message_id) values
 (current_setting('p8.project')::uuid,'Spawn timing','Use five seconds.',current_setting('p8.dm_msg')::uuid) returning id)
select set_config('p8.decision',id::text,true) from d;
with d as (insert into public.project_decisions(project_id,title,body,source_message_id) values
 (current_setting('p8.project')::uuid,'Private decision','Approved by project owner.',current_setting('p8.private_msg')::uuid) returning id)
select set_config('p8.private_decision',id::text,true) from d;
select set_config('request.jwt.claim.sub','c8c8c8c8-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$ begin
 if not exists(select 1 from public.project_decisions where id=current_setting('p8.private_decision')::uuid)
   or exists(select 1 from public.messages where id=current_setting('p8.private_msg')::uuid)
   then raise exception 'private source leaked or decision hidden from workspace admin'; end if;
end $$;
select set_config('request.jwt.claim.sub','a8a8a8a8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ declare denied boolean:=false; begin
 begin insert into public.project_decisions(project_id,title,body,source_message_id) values
  (current_setting('p8.project')::uuid,'Wrong workspace','Should fail',current_setting('p8.other_msg')::uuid);
 exception when others then denied:=true; end;
 if not denied then raise exception 'decision accepted cross-workspace source'; end if;
 if (select count(*) from public.project_activity where project_id=current_setting('p8.project')::uuid
   and event in ('task_created','task_completed','decision_created'))<>4 then
   raise exception 'project activity missing'; end if;
end $$;
with t as (insert into public.project_tasks(project_id,title,assignee_id,source_message_id) values
 (current_setting('p8.project')::uuid,'Follow up from DM',
  'b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,current_setting('p8.dm_msg')::uuid) returning id)
select set_config('p8.dm_task',id::text,true) from t;
update public.messages set deleted_at=now() where id=current_setting('p8.dm_msg')::uuid;
do $$ begin
 if not exists(select 1 from public.project_decisions where id=current_setting('p8.decision')::uuid)
   then raise exception 'decision lost after source deletion'; end if;
 if exists(select 1 from public.messages where id=current_setting('p8.dm_msg')::uuid and deleted_at is null)
   then raise exception 'deleted source still visible'; end if;
end $$;
select public.remove_workspace_member(current_setting('p8.workspace')::uuid,
 'b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid);
do $$ begin
 if (select assignee_id from public.project_tasks where id=current_setting('p8.task')::uuid) is not null
   or (select assignee_id from public.project_tasks where id=current_setting('p8.dm_task')::uuid) is not null
   then raise exception 'departed member retained task assignment'; end if;
end $$;
select set_config('request.jwt.claim.sub','b8b8b8b8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ begin
 if exists(select 1 from public.projects where id=current_setting('p8.project')::uuid)
   or exists(select 1 from public.project_tasks where id=current_setting('p8.task')::uuid)
   or exists(select 1 from public.project_decisions where id=current_setting('p8.decision')::uuid)
   or exists(select 1 from public.project_activity where project_id=current_setting('p8.project')::uuid)
   then raise exception 'removed member retained project access'; end if;
end $$;
select set_config('request.jwt.claim.sub','e8e8e8e8-eeee-4eee-8eee-eeeeeeeeeee5',true);
do $$ declare denied boolean:=false; begin
 if exists(select 1 from public.projects where id=current_setting('p8.project')::uuid)
   or exists(select 1 from public.project_tasks where id=current_setting('p8.task')::uuid)
   or exists(select 1 from public.project_decisions where id=current_setting('p8.decision')::uuid)
   then raise exception 'workspace outsider read project data'; end if;
 begin insert into public.project_tasks(project_id,title) values
  (current_setting('p8.project')::uuid,'Outsider task');
 exception when others then denied:=true; end;
 if not denied then raise exception 'workspace outsider created task'; end if;
 denied:=false;
 begin insert into public.project_decisions(project_id,title,body) values
  (current_setting('p8.project')::uuid,'Outsider decision','Should fail');
 exception when others then denied:=true; end;
 if not denied then raise exception 'workspace outsider recorded decision'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.projects','SELECT')
   or has_table_privilege('authenticated','public.project_activity','INSERT')
   or has_table_privilege('authenticated','public.project_decisions','UPDATE')
   then raise exception 'Phase 8 grants too broad'; end if;
end $$;
rollback;
