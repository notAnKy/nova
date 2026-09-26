-- Transactional Phase 6 part 2 access and data integrity checks.
begin;
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
 ('f8f8f8f8-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-threads-a@example.invalid','',now()),
 ('f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-threads-b@example.invalid','',now()),
 ('f8f8f8f8-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-threads-c@example.invalid','',now()),
 ('f8f8f8f8-dddd-4ddd-8ddd-ddddddddddd4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-threads-d@example.invalid','',now()),
 ('f8f8f8f8-eeee-4eee-8eee-eeeeeeeeeee5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6-threads-e@example.invalid','',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','f8f8f8f8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p6b.workspace',public.create_workspace('Phase 6 threads','phase6-threads-workspace')->>'id',true);
select set_config('p6b.public',public.create_channel(current_setting('p6b.workspace')::uuid,'General','general','', 'public_channel')->>'id',true);
select set_config('p6b.private',public.create_channel(current_setting('p6b.workspace')::uuid,'Private','private','', 'private_channel')->>'id',true);
select set_config('p6b.invite_b',public.create_workspace_invitation(current_setting('p6b.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p6b.invite_c',public.create_workspace_invitation(current_setting('p6b.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p6b.invite_d',public.create_workspace_invitation(current_setting('p6b.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('request.jwt.claim.sub','f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
select public.accept_workspace_invitation(current_setting('p6b.invite_b'));
select set_config('request.jwt.claim.sub','f8f8f8f8-cccc-4ccc-8ccc-ccccccccccc3',true);
select public.accept_workspace_invitation(current_setting('p6b.invite_c'));
select set_config('request.jwt.claim.sub','f8f8f8f8-dddd-4ddd-8ddd-ddddddddddd4',true);
select public.accept_workspace_invitation(current_setting('p6b.invite_d'));
select set_config('request.jwt.claim.sub','f8f8f8f8-eeee-4eee-8eee-eeeeeeeeeee5',true);
select set_config('p6b.other',public.create_workspace('Other phase 6 threads','phase6-threads-other')->>'id',true);

select set_config('request.jwt.claim.sub','f8f8f8f8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select public.add_private_channel_member(current_setting('p6b.private')::uuid,'f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid);
select set_config('p6b.direct',public.create_or_get_direct(current_setting('p6b.workspace')::uuid,
  'f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid)->>'id',true);
select set_config('p6b.group',public.create_group_direct(current_setting('p6b.workspace')::uuid,
  array['f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2','f8f8f8f8-cccc-4ccc-8ccc-ccccccccccc3']::uuid[])->>'id',true);
with m as (insert into public.messages(conversation_id,body)
 values(current_setting('p6b.public')::uuid,'Public root') returning id)
select set_config('p6b.public_root',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body)
 values(current_setting('p6b.private')::uuid,'Private root') returning id)
select set_config('p6b.private_root',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body)
 values(current_setting('p6b.direct')::uuid,'Direct root') returning id)
select set_config('p6b.direct_root',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body)
 values(current_setting('p6b.group')::uuid,'Group root') returning id)
select set_config('p6b.group_root',id::text,true) from m;

select set_config('request.jwt.claim.sub','f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
with m as (insert into public.messages(conversation_id,parent_message_id,body)
 values(current_setting('p6b.public')::uuid,current_setting('p6b.public_root')::uuid,
   'Public reply @[f8f8f8f8-aaaa-4aaa-8aaa-aaaaaaaaaaa1]') returning id)
select set_config('p6b.public_reply',id::text,true) from m;
with m as (insert into public.messages(conversation_id,parent_message_id,body)
 values(current_setting('p6b.private')::uuid,current_setting('p6b.private_root')::uuid,'Private reply') returning id)
select set_config('p6b.private_reply',id::text,true) from m;
with m as (insert into public.messages(conversation_id,parent_message_id,body)
 values(current_setting('p6b.direct')::uuid,current_setting('p6b.direct_root')::uuid,'Direct reply') returning id)
select set_config('p6b.direct_reply',id::text,true) from m;
with m as (insert into public.messages(conversation_id,parent_message_id,body)
 values(current_setting('p6b.group')::uuid,current_setting('p6b.group_root')::uuid,'Group reply') returning id)
select set_config('p6b.group_reply',id::text,true) from m;
reset role;
do $$ begin
 if not exists(select 1 from public.message_mentions
   where message_id=current_setting('p6b.public_reply')::uuid
     and user_id='f8f8f8f8-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid) then
   raise exception 'mention in thread reply was not stored'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);

do $$ declare denied boolean; begin
 denied:=false;
 begin insert into public.messages(conversation_id,parent_message_id,body)
   values(current_setting('p6b.private')::uuid,current_setting('p6b.public_root')::uuid,'Cross conversation');
 exception when others then if sqlerrm='thread_root_not_found' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'cross-conversation reply accepted'; end if;
 denied:=false;
 begin insert into public.messages(conversation_id,parent_message_id,body)
   values(current_setting('p6b.public')::uuid,current_setting('p6b.public_reply')::uuid,'Nested reply');
 exception when others then if sqlerrm='nested_thread_not_allowed' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'nested reply accepted'; end if;
 if (select count(*) from public.list_channel_messages(current_setting('p6b.public')::uuid))<>1
    or (select count(*) from public.list_thread_replies(current_setting('p6b.public')::uuid,
      current_setting('p6b.public_root')::uuid))<>1 then
   raise exception 'top-level/reply pagination mixed'; end if;
end $$;

insert into public.message_reactions(message_id,emoji)
 values(current_setting('p6b.public_root')::uuid,'👍'),
       (current_setting('p6b.private_reply')::uuid,'😂'),
       (current_setting('p6b.public_reply')::uuid,'✅');
do $$ declare denied boolean:=false; begin
 begin insert into public.message_reactions(message_id,emoji)
   values(current_setting('p6b.public_root')::uuid,'👍');
 exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'duplicate reaction accepted'; end if;
 denied:=false;
 begin insert into public.message_reactions(message_id,user_id,emoji)
   values(current_setting('p6b.public_reply')::uuid,
     'f8f8f8f8-cccc-4ccc-8ccc-ccccccccccc3'::uuid,'🔥');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'reaction user ID spoof accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','f8f8f8f8-cccc-4ccc-8ccc-ccccccccccc3',true);
insert into public.message_reactions(message_id,emoji)
 values(current_setting('p6b.public_root')::uuid,'👍'),
       (current_setting('p6b.group_reply')::uuid,'🔥');
do $$ declare denied boolean:=false; begin
 begin insert into public.message_reactions(message_id,emoji)
   values(current_setting('p6b.private_reply')::uuid,'😂');
 exception when others then denied:=true; end;
 if not denied then raise exception 'private reaction by nonmember accepted'; end if;
 denied:=false;
 begin insert into public.messages(conversation_id,parent_message_id,body)
   values(current_setting('p6b.private')::uuid,current_setting('p6b.private_root')::uuid,'Private outsider reply');
 exception when others then denied:=true; end;
 if not denied then raise exception 'private reply by nonmember accepted'; end if;
 if exists(select 1 from public.message_reactions where message_id=current_setting('p6b.private_reply')::uuid) then
   raise exception 'private reaction exposed to nonmember'; end if;
 if exists(select 1 from public.messages where id=current_setting('p6b.private_reply')::uuid) then
   raise exception 'private reply exposed to nonmember'; end if;
end $$;
delete from public.message_reactions where message_id=current_setting('p6b.public_root')::uuid
 and user_id='f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid and emoji='👍';
do $$ begin
 if (select count(*) from public.message_reactions where message_id=current_setting('p6b.public_root')::uuid)<>2 then
   raise exception 'another user removed a reaction'; end if;
end $$;

select set_config('request.jwt.claim.sub','f8f8f8f8-eeee-4eee-8eee-eeeeeeeeeee5',true);
do $$ declare denied boolean:=false; begin
 begin insert into public.messages(conversation_id,parent_message_id,body)
   values(current_setting('p6b.public')::uuid,current_setting('p6b.public_root')::uuid,'Outsider reply');
 exception when others then denied:=true; end;
 if not denied then raise exception 'outsider replied'; end if;
 denied:=false;
 begin insert into public.message_reactions(message_id,emoji)
   values(current_setting('p6b.public_root')::uuid,'🔥');
 exception when others then denied:=true; end;
 if not denied then raise exception 'outsider reacted'; end if;
 if exists(select 1 from public.messages where id=current_setting('p6b.public_reply')::uuid)
    or exists(select 1 from public.message_reactions where message_id=current_setting('p6b.public_root')::uuid)
    or exists(select 1 from public.list_thread_summaries(current_setting('p6b.public')::uuid,
        array[current_setting('p6b.public_root')::uuid])) then
   raise exception 'outsider inferred thread or reactions'; end if;
end $$;

select set_config('request.jwt.claim.sub','f8f8f8f8-dddd-4ddd-8ddd-ddddddddddd4',true);
with m as (insert into public.messages(conversation_id,parent_message_id,body)
 values(current_setting('p6b.public')::uuid,current_setting('p6b.public_root')::uuid,'Later removed') returning id)
select set_config('p6b.removed_reply',id::text,true) from m;
select set_config('request.jwt.claim.sub','f8f8f8f8-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
update public.messages set deleted_at=now() where id=current_setting('p6b.public_root')::uuid;
do $$ begin
 if (select count(*) from public.list_thread_replies(current_setting('p6b.public')::uuid,
    current_setting('p6b.public_root')::uuid))<>2 then
   raise exception 'soft-deleting root removed replies'; end if;
 if (select reply_count from public.list_thread_summaries(current_setting('p6b.public')::uuid,
    array[current_setting('p6b.public_root')::uuid]))<>2 then
   raise exception 'reply count wrong'; end if;
end $$;
do $$ declare changed integer; begin
 update public.messages set body='Owner tried to edit another reply'
   where id=current_setting('p6b.public_reply')::uuid;
 get diagnostics changed = row_count;
 if changed<>0 then raise exception 'another author edited reply'; end if;
 update public.messages set deleted_at=now()
   where id=current_setting('p6b.public_reply')::uuid;
 get diagnostics changed = row_count;
 if changed<>0 then raise exception 'another author deleted reply'; end if;
end $$;
do $$ declare denied boolean:=false; begin
 begin insert into public.message_reactions(message_id,emoji)
   values(current_setting('p6b.public_root')::uuid,'✅');
 exception when others then denied:=true; end;
 if not denied then raise exception 'deleted root accepted reaction'; end if;
end $$;
reset role;
delete from public.workspace_members where workspace_id=current_setting('p6b.workspace')::uuid
 and user_id='f8f8f8f8-dddd-4ddd-8ddd-ddddddddddd4'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','f8f8f8f8-dddd-4ddd-8ddd-ddddddddddd4',true);
do $$ begin
 if exists(select 1 from public.messages where id=current_setting('p6b.removed_reply')::uuid)
    or exists(select 1 from public.list_thread_summaries(current_setting('p6b.public')::uuid,
      array[current_setting('p6b.public_root')::uuid])) then
   raise exception 'removed member retained thread access'; end if;
end $$;
do $$ declare denied boolean:=false; begin
 begin insert into public.messages(conversation_id,parent_message_id,body)
   values(current_setting('p6b.public')::uuid,current_setting('p6b.public_root')::uuid,'Removed member reply');
 exception when others then denied:=true; end;
 if not denied then raise exception 'removed member could reply'; end if;
end $$;
select set_config('request.jwt.claim.sub','f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
update public.messages set body='Edited reply' where id=current_setting('p6b.public_reply')::uuid;
update public.messages set deleted_at=now() where id=current_setting('p6b.private_reply')::uuid;
delete from public.message_reactions where message_id=current_setting('p6b.public_root')::uuid
 and user_id='f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid and emoji='👍';
reset role;
do $$ begin
 if exists(select 1 from public.message_reactions where message_id=current_setting('p6b.private_reply')::uuid)
   or exists(select 1 from public.message_reactions where message_id=current_setting('p6b.public_root')::uuid) then
   raise exception 'deleted message retained reactions'; end if;
 if not exists(select 1 from public.message_reactions
   where message_id=current_setting('p6b.public_reply')::uuid
     and user_id='f8f8f8f8-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid and emoji='✅') then
   raise exception 'editing reply lost its reaction'; end if;
 if exists(select 1 from public.message_mentions where message_id=current_setting('p6b.public_reply')::uuid) then
   raise exception 'editing reply did not clear stale mention'; end if;
 if not (select relrowsecurity from pg_class where oid='public.message_reactions'::regclass)
    or has_table_privilege('anon','public.message_reactions','SELECT') then
   raise exception 'reaction table access is unsafe'; end if;
end $$;
rollback;
