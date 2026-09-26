-- Run against the linked Phase 5 schema. Every synthetic row rolls back.
begin;
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5-a@example.invalid','',now()),
  ('b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5-b@example.invalid','',now()),
  ('c6c6c6c6-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5-c@example.invalid','',now()),
  ('d6d6d6d6-dddd-4ddd-8ddd-ddddddddddd4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5-d@example.invalid','',now()),
  ('e6e6e6e6-eeee-4eee-8eee-eeeeeeeeeee5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5-e@example.invalid','',now()),
  ('f6f6f6f6-ffff-4fff-8fff-fffffffffff6','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5-f@example.invalid','',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p5.workspace',public.create_workspace('Phase 5 test','phase5-test-workspace')->>'id',true);
select set_config('p5.invite_b',public.create_workspace_invitation(current_setting('p5.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p5.invite_c',public.create_workspace_invitation(current_setting('p5.workspace')::uuid,'admin',24,1)->>'token',true);
select set_config('p5.invite_d',public.create_workspace_invitation(current_setting('p5.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p5.invite_e',public.create_workspace_invitation(current_setting('p5.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('request.jwt.claim.sub','b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
select public.accept_workspace_invitation(current_setting('p5.invite_b'));
select set_config('request.jwt.claim.sub','c6c6c6c6-cccc-4ccc-8ccc-ccccccccccc3',true);
select public.accept_workspace_invitation(current_setting('p5.invite_c'));
select set_config('request.jwt.claim.sub','d6d6d6d6-dddd-4ddd-8ddd-ddddddddddd4',true);
select public.accept_workspace_invitation(current_setting('p5.invite_d'));
select set_config('request.jwt.claim.sub','e6e6e6e6-eeee-4eee-8eee-eeeeeeeeeee5',true);
select public.accept_workspace_invitation(current_setting('p5.invite_e'));
select set_config('request.jwt.claim.sub','f6f6f6f6-ffff-4fff-8fff-fffffffffff6',true);
select set_config('p5.other_workspace',public.create_workspace('Other workspace','phase5-other-workspace')->>'id',true);

select set_config('request.jwt.claim.sub','a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p5.direct',public.create_or_get_direct(current_setting('p5.workspace')::uuid,'b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid)->>'id',true);
do $$ begin
  if (select count(*) from public.conversation_members where conversation_id=current_setting('p5.direct')::uuid) <> 2 then
    raise exception 'direct does not have exactly two participants'; end if;
  if (select kind from public.conversations where id=current_setting('p5.direct')::uuid) <> 'direct' then
    raise exception 'direct kind missing'; end if;
  if not nova_private.can_read_realtime_topic('channel:'||current_setting('p5.direct')) then
    raise exception 'direct creator denied realtime'; end if;
  if (public.create_or_get_direct(current_setting('p5.workspace')::uuid,'b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid)->>'id')::uuid
      <> current_setting('p5.direct')::uuid then raise exception 'direct creation duplicated pair'; end if;
end $$;
select set_config('request.jwt.claim.sub','b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ begin
  if (public.create_or_get_direct(current_setting('p5.workspace')::uuid,'a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid)->>'id')::uuid
      <> current_setting('p5.direct')::uuid then raise exception 'reverse pair created another direct'; end if;
  if not exists (select 1 from public.conversations where id=current_setting('p5.direct')::uuid) then
    raise exception 'second participant cannot read direct'; end if;
  if not nova_private.can_read_realtime_topic('channel:'||current_setting('p5.direct')) then
    raise exception 'second participant denied realtime'; end if;
end $$;
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p5.direct')::uuid,'B owns this direct message') returning id)
select set_config('p5.b_message',id::text,true) from inserted;
update public.messages set body='B edited own direct message' where id=current_setting('p5.b_message')::uuid;

select set_config('request.jwt.claim.sub','c6c6c6c6-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$ declare denied boolean:=false; begin
  if exists(select 1 from public.conversations where id=current_setting('p5.direct')::uuid) then
    raise exception 'workspace admin read private direct'; end if;
  if exists(select 1 from public.conversation_members where conversation_id=current_setting('p5.direct')::uuid) then
    raise exception 'admin read direct participant list'; end if;
  if exists(select 1 from public.messages where id=current_setting('p5.b_message')::uuid) then
    raise exception 'admin read direct message'; end if;
  if nova_private.can_read_realtime_topic('channel:'||current_setting('p5.direct')) then
    raise exception 'admin joined direct realtime'; end if;
  begin insert into public.messages(conversation_id,body) values(current_setting('p5.direct')::uuid,'Intrusion');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'admin sent into direct'; end if;
  denied:=false;
  begin insert into public.conversation_members(workspace_id,conversation_id,user_id)
    values(current_setting('p5.workspace')::uuid,current_setting('p5.direct')::uuid,auth.uid());
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'admin inserted third direct participant'; end if;
end $$;

select set_config('request.jwt.claim.sub','a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ declare changed integer; denied boolean:=false; begin
  if not exists(select 1 from public.messages where id=current_setting('p5.b_message')::uuid) then
    raise exception 'direct participant cannot read message'; end if;
  update public.messages set body='A edits B' where id=current_setting('p5.b_message')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'other participant edited message'; end if;
  update public.messages set deleted_at=now() where id=current_setting('p5.b_message')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'other participant deleted message'; end if;
  begin perform public.create_or_get_direct(current_setting('p5.workspace')::uuid,auth.uid());
  exception when others then if sqlerrm='invalid_direct_recipient' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'self-only direct created'; end if;
end $$;
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p5.direct')::uuid,'A direct message') returning id)
select set_config('p5.a_message',id::text,true) from inserted;
select public.mark_channel_read(current_setting('p5.direct')::uuid,current_setting('p5.a_message')::uuid);
do $$ begin
  if not exists(select 1 from public.conversation_reads where conversation_id=current_setting('p5.direct')::uuid and user_id=auth.uid()) then
    raise exception 'direct read cursor missing'; end if;
end $$;

select set_config('p5.group',public.create_group_direct(current_setting('p5.workspace')::uuid,
  array['b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2','d6d6d6d6-dddd-4ddd-8ddd-ddddddddddd4',
        'e6e6e6e6-eeee-4eee-8eee-eeeeeeeeeee5']::uuid[])->>'id',true);
do $$ declare denied boolean:=false; begin
  if (select count(*) from public.conversation_members where conversation_id=current_setting('p5.group')::uuid)<>4 then
    raise exception 'group membership incomplete'; end if;
  begin perform public.create_group_direct(current_setting('p5.workspace')::uuid,
    array['b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2','b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2']::uuid[]);
  exception when others then if sqlerrm='invalid_group_recipients' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'duplicate group participants accepted'; end if;
  denied:=false;
  begin perform public.create_group_direct(current_setting('p5.workspace')::uuid,
    array['b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2','f6f6f6f6-ffff-4fff-8fff-fffffffffff6']::uuid[]);
  exception when others then if sqlerrm='member_not_found' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'cross-workspace participant accepted'; end if;
end $$;

select set_config('request.jwt.claim.sub','d6d6d6d6-dddd-4ddd-8ddd-ddddddddddd4',true);
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p5.group')::uuid,'D sends to group') returning id)
select set_config('p5.group_message',id::text,true) from inserted;
do $$ begin
  if not nova_private.can_read_realtime_topic('channel:'||current_setting('p5.group')) then
    raise exception 'group participant denied realtime'; end if;
end $$;

select set_config('request.jwt.claim.sub','c6c6c6c6-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$ declare denied boolean:=false; begin
  if exists(select 1 from public.conversations where id=current_setting('p5.group')::uuid) then
    raise exception 'admin read nonparticipant group'; end if;
  if exists(select 1 from public.messages where id=current_setting('p5.group_message')::uuid) then
    raise exception 'admin read group message'; end if;
  if nova_private.can_read_realtime_topic('channel:'||current_setting('p5.group')) then
    raise exception 'admin joined group realtime'; end if;
  begin insert into public.messages(conversation_id,body) values(current_setting('p5.group')::uuid,'Intrusion');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'admin sent into group'; end if;
end $$;

select set_config('request.jwt.claim.sub','a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select public.remove_workspace_member(current_setting('p5.workspace')::uuid,'e6e6e6e6-eeee-4eee-8eee-eeeeeeeeeee5'::uuid);
do $$ begin
  if (select count(*) from public.conversation_members where conversation_id=current_setting('p5.group')::uuid)<>3 then
    raise exception 'group did not retain three members'; end if;
end $$;
select set_config('request.jwt.claim.sub','e6e6e6e6-eeee-4eee-8eee-eeeeeeeeeee5',true);
do $$ begin
  if exists(select 1 from public.conversations where id=current_setting('p5.group')::uuid) then
    raise exception 'removed workspace member read group'; end if;
  if nova_private.can_read_realtime_topic('channel:'||current_setting('p5.group')) then
    raise exception 'removed workspace member joined group realtime'; end if;
end $$;

select set_config('request.jwt.claim.sub','a6a6a6a6-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select public.remove_workspace_member(current_setting('p5.workspace')::uuid,'d6d6d6d6-dddd-4ddd-8ddd-ddddddddddd4'::uuid);
do $$ begin
  if exists(select 1 from public.conversations where id=current_setting('p5.group')::uuid) then
    raise exception 'group below three participants not pruned'; end if;
end $$;
select public.remove_workspace_member(current_setting('p5.workspace')::uuid,'b6b6b6b6-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid);
do $$ begin
  if exists(select 1 from public.conversations where id=current_setting('p5.direct')::uuid) then
    raise exception 'direct with one participant not pruned'; end if;
end $$;

reset role;
do $$ begin
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='conversations_direct_pair_unique') then
    raise exception 'direct pair unique index missing'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='conversations_direct_high_member_idx') then
    raise exception 'direct high member index missing'; end if;
  if has_function_privilege('anon','public.create_or_get_direct(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.create_group_direct(uuid,uuid[])','EXECUTE')
    or has_table_privilege('authenticated','public.conversation_members','INSERT') then
    raise exception 'direct grants too broad'; end if;
end $$;
set local role anon;
do $$ begin
  if has_table_privilege(current_user,'public.conversations','SELECT') then
    raise exception 'anon has conversation SELECT'; end if;
end $$;
reset role;
rollback;
