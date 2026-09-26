-- Run against the linked Phase 6 schema. Every synthetic row rolls back.
begin;
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('a7a7a7a7-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-a@example.invalid','',now()),
  ('b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-b@example.invalid','',now()),
  ('c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-c@example.invalid','',now()),
  ('d7d7d7d7-dddd-4ddd-8ddd-ddddddddddd4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-d@example.invalid','',now()),
  ('e7e7e7e7-eeee-4eee-8eee-eeeeeeeeeee5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-e@example.invalid','',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','a7a7a7a7-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p6.workspace',public.create_workspace('Phase 6 test','phase6-test-workspace')->>'id',true);
select set_config('p6.public',public.create_channel(current_setting('p6.workspace')::uuid,'General','general','', 'public_channel')->>'id',true);
select set_config('p6.private',public.create_channel(current_setting('p6.workspace')::uuid,'Private','private','', 'private_channel')->>'id',true);
select set_config('p6.invite_b',public.create_workspace_invitation(current_setting('p6.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p6.invite_c',public.create_workspace_invitation(current_setting('p6.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p6.invite_d',public.create_workspace_invitation(current_setting('p6.workspace')::uuid,'member',24,1)->>'token',true);

select set_config('request.jwt.claim.sub','b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
select public.accept_workspace_invitation(current_setting('p6.invite_b'));
select set_config('request.jwt.claim.sub','c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3',true);
select public.accept_workspace_invitation(current_setting('p6.invite_c'));
select set_config('request.jwt.claim.sub','d7d7d7d7-dddd-4ddd-8ddd-ddddddddddd4',true);
select public.accept_workspace_invitation(current_setting('p6.invite_d'));
select set_config('request.jwt.claim.sub','e7e7e7e7-eeee-4eee-8eee-eeeeeeeeeee5',true);
select set_config('p6.other',public.create_workspace('Other Phase 6','phase6-other-workspace')->>'id',true);

select set_config('request.jwt.claim.sub','a7a7a7a7-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select public.add_private_channel_member(current_setting('p6.private')::uuid,'b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid);
select set_config('p6.direct',public.create_or_get_direct(current_setting('p6.workspace')::uuid,'b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid)->>'id',true);
select set_config('p6.group',public.create_group_direct(current_setting('p6.workspace')::uuid,
  array['b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2','c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3']::uuid[])->>'id',true);

with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p6.public')::uuid,'Hey @[b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2], check this. Email a@b.com is plain text.') returning id)
select set_config('p6.public_message',id::text,true) from inserted;
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p6.private')::uuid,'Private @[b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2]') returning id)
select set_config('p6.private_message',id::text,true) from inserted;
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p6.direct')::uuid,'Direct @[b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2]') returning id)
select set_config('p6.direct_message',id::text,true) from inserted;
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p6.group')::uuid,'Group @[c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3]') returning id)
select set_config('p6.group_message',id::text,true) from inserted;
select set_config('request.jwt.claim.sub','b7b7b7b7-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
with inserted as (insert into public.messages(conversation_id,body)
  values(current_setting('p6.public')::uuid,'Member mentions @[c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3]') returning id)
select set_config('p6.member_message',id::text,true) from inserted;
select set_config('request.jwt.claim.sub','a7a7a7a7-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);

do $$ declare denied boolean; begin
  denied:=false;
  begin insert into public.messages(conversation_id,body)
    values(current_setting('p6.private')::uuid,'Wrong @[d7d7d7d7-dddd-4ddd-8ddd-ddddddddddd4]');
  exception when others then if sqlerrm='invalid_mention_recipient' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'private channel accepted nonmember mention'; end if;
  denied:=false;
  begin insert into public.messages(conversation_id,body)
    values(current_setting('p6.direct')::uuid,'Wrong @[c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3]');
  exception when others then if sqlerrm='invalid_mention_recipient' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'direct accepted outsider mention'; end if;
  denied:=false;
  begin insert into public.messages(conversation_id,body)
    values(current_setting('p6.group')::uuid,'Wrong @[d7d7d7d7-dddd-4ddd-8ddd-ddddddddddd4]');
  exception when others then if sqlerrm='invalid_mention_recipient' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'group accepted nonparticipant mention'; end if;
  denied:=false;
  begin insert into public.messages(conversation_id,body)
    values(current_setting('p6.public')::uuid,'Wrong @[e7e7e7e7-eeee-4eee-8eee-eeeeeeeeeee5]');
  exception when others then if sqlerrm='invalid_mention_recipient' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'public channel accepted other-workspace mention'; end if;
end $$;

select set_config('request.jwt.claim.sub','d7d7d7d7-dddd-4ddd-8ddd-ddddddddddd4',true);
do $$ begin
  if exists(select 1 from public.conversation_members where conversation_id=current_setting('p6.private')::uuid) then
    raise exception 'private channel autocomplete roster leaked'; end if;
  if exists(select 1 from public.messages where id in (current_setting('p6.private_message')::uuid,
      current_setting('p6.direct_message')::uuid,current_setting('p6.group_message')::uuid)) then
    raise exception 'nonparticipant read private mentioned message'; end if;
end $$;
select set_config('request.jwt.claim.sub','e7e7e7e7-eeee-4eee-8eee-eeeeeeeeeee5',true);
do $$ begin
  if exists(select 1 from public.messages where id=current_setting('p6.public_message')::uuid) then
    raise exception 'workspace outsider read mentioned message'; end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.message_mentions where message_id in
      (current_setting('p6.public_message')::uuid,current_setting('p6.private_message')::uuid,
       current_setting('p6.direct_message')::uuid,current_setting('p6.group_message')::uuid,
       current_setting('p6.member_message')::uuid))<>5 then
    raise exception 'valid mention metadata missing'; end if;
  if has_table_privilege('authenticated','public.message_mentions','SELECT')
     or has_table_privilege('authenticated','public.message_mentions','INSERT')
     or has_table_privilege('anon','public.message_mentions','SELECT') then
    raise exception 'mention metadata grants too broad'; end if;
  if not (select relrowsecurity from pg_class where oid='public.message_mentions'::regclass) then
    raise exception 'mention metadata RLS disabled'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a7a7a7a7-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ declare denied boolean:=false; begin
  begin update public.messages set body='Invalid edit @[e7e7e7e7-eeee-4eee-8eee-eeeeeeeeeee5]'
    where id=current_setting('p6.public_message')::uuid;
  exception when others then if sqlerrm='invalid_mention_recipient' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'edit accepted other-workspace mention'; end if;
end $$;
update public.messages set body='Now @[c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3] only'
  where id=current_setting('p6.public_message')::uuid;
update public.messages set deleted_at=now() where id=current_setting('p6.private_message')::uuid;
reset role;
do $$ begin
  if (select count(*) from public.message_mentions where message_id=current_setting('p6.public_message')::uuid)<>1
     or not exists(select 1 from public.message_mentions where message_id=current_setting('p6.public_message')::uuid
       and user_id='c7c7c7c7-cccc-4ccc-8ccc-ccccccccccc3'::uuid) then
    raise exception 'edit did not replace mention relationship'; end if;
  if exists(select 1 from public.message_mentions where message_id=current_setting('p6.private_message')::uuid) then
    raise exception 'deleted message retained mention metadata'; end if;
end $$;
rollback;
