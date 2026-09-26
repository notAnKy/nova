-- Run against a Phase 4 schema as a privileged SQL editor session.
-- The transaction rolls back every synthetic user, channel, and message.
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-a@example.invalid', '', now()),
  ('b4b4b4b4-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-b@example.invalid', '', now()),
  ('c4c4c4c4-cccc-4ccc-8ccc-ccccccccccc3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-c@example.invalid', '', now()),
  ('d4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-d@example.invalid', '', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select set_config('p4.workspace', public.create_workspace('Phase 4 test', 'phase4-test-workspace')->>'id', true);
select set_config('p4.public', public.create_channel(current_setting('p4.workspace')::uuid, 'General', 'general', 'Public test', 'public_channel')->>'id', true);
select set_config('p4.private', public.create_channel(current_setting('p4.workspace')::uuid, 'Planning', 'planning', 'Private test', 'private_channel')->>'id', true);
select set_config('p4.invite_b', public.create_workspace_invitation(current_setting('p4.workspace')::uuid, 'member', 24, 1)->>'token', true);
select set_config('p4.invite_d', public.create_workspace_invitation(current_setting('p4.workspace')::uuid, 'member', 24, 1)->>'token', true);

do $$ begin
  if (select count(*) from public.conversations where workspace_id = current_setting('p4.workspace')::uuid) <> 2 then raise exception 'owner cannot read channels'; end if;
  if not nova_private.can_read_realtime_topic('channel:' || current_setting('p4.private')) then raise exception 'owner denied realtime'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'b4b4b4b4-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
select public.accept_workspace_invitation(current_setting('p4.invite_b'));
do $$ declare denied boolean := false; begin
  if not exists (select 1 from public.conversations where id = current_setting('p4.public')::uuid) then raise exception 'member cannot read public channel'; end if;
  if exists (select 1 from public.conversations where id = current_setting('p4.private')::uuid) then raise exception 'private name leaked to member'; end if;
  if exists (select 1 from public.conversation_members where conversation_id = current_setting('p4.private')::uuid) then raise exception 'private roster leaked'; end if;
  if nova_private.can_read_realtime_topic('channel:' || current_setting('p4.private')) then raise exception 'private realtime allowed to member'; end if;
  begin perform public.create_channel(current_setting('p4.workspace')::uuid, 'Unauthorized', 'unauthorized', '', 'public_channel');
  exception when others then if sqlerrm = 'permission_denied' then denied := true; else raise; end if; end;
  if not denied then raise exception 'member created a channel'; end if;
  denied := false;
  begin perform public.add_private_channel_member(current_setting('p4.private')::uuid, auth.uid());
  exception when others then if sqlerrm = 'permission_denied' then denied := true; else raise; end if; end;
  if not denied then raise exception 'member added self to private channel'; end if;
  denied := false;
  begin insert into public.conversation_members(workspace_id, conversation_id, user_id)
    values (current_setting('p4.workspace')::uuid, current_setting('p4.private')::uuid, auth.uid());
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'direct private membership insert succeeded'; end if;
end $$;
with inserted as (
  insert into public.messages(conversation_id, body)
  values (current_setting('p4.public')::uuid, 'B public message') returning id
)
select set_config('p4.b_message', id::text, true) from inserted;
do $$ declare denied boolean := false; begin
  begin insert into public.messages(conversation_id, body)
    values (current_setting('p4.private')::uuid, 'Private intrusion');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'member sent to private channel'; end if;
  denied := false;
  begin insert into public.messages(conversation_id, author_id, body)
    values (current_setting('p4.public')::uuid, 'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Spoofed');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'member spoofed author'; end if;
  denied := false;
  begin insert into public.messages(conversation_id, body)
    values (current_setting('p4.public')::uuid, '   ');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'blank message accepted'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4', true);
select public.accept_workspace_invitation(current_setting('p4.invite_d'));
select set_config('request.jwt.claim.sub', 'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select public.add_private_channel_member(current_setting('p4.private')::uuid, 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4');
select set_config('request.jwt.claim.sub', 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4', true);
do $$ begin
  if not exists (select 1 from public.conversations where id = current_setting('p4.private')::uuid) then raise exception 'private member cannot read channel'; end if;
  if not nova_private.can_read_realtime_topic('channel:' || current_setting('p4.private')) then raise exception 'private member denied realtime'; end if;
end $$;
with inserted as (
  insert into public.messages(conversation_id, body)
  values (current_setting('p4.private')::uuid, 'D private message') returning id
)
select set_config('p4.d_message', id::text, true) from inserted;

select set_config('request.jwt.claim.sub', 'c4c4c4c4-cccc-4ccc-8ccc-ccccccccccc3', true);
do $$ declare denied boolean := false; begin
  if exists (select 1 from public.conversations where workspace_id = current_setting('p4.workspace')::uuid) then raise exception 'outsider read channels'; end if;
  if exists (select 1 from public.messages where conversation_id in
    (current_setting('p4.public')::uuid, current_setting('p4.private')::uuid)) then raise exception 'outsider read messages'; end if;
  if nova_private.can_read_realtime_topic('channel:' || current_setting('p4.public')) then raise exception 'outsider joined realtime'; end if;
  begin insert into public.messages(conversation_id, body) values (current_setting('p4.public')::uuid, 'Outsider');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'outsider sent message'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
do $$ declare denied boolean := false; begin
  begin perform public.add_private_channel_member(current_setting('p4.private')::uuid,
    'c4c4c4c4-cccc-4ccc-8ccc-ccccccccccc3');
  exception when others then if sqlerrm = 'member_not_found' then denied := true; else raise; end if; end;
  if not denied then raise exception 'outsider added to private channel'; end if;
end $$;
with inserted as (
  insert into public.messages(conversation_id, body)
  values (current_setting('p4.public')::uuid, 'A owns this message') returning id
)
select set_config('p4.a_message', id::text, true) from inserted;
update public.messages set body = 'A edited this message'
where id = current_setting('p4.a_message')::uuid;
do $$ begin
  if (select edited_at from public.messages where id = current_setting('p4.a_message')::uuid) is null then raise exception 'own edit did not persist'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'b4b4b4b4-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
do $$ declare changed integer; denied boolean := false; begin
  update public.messages set body = 'B edits A' where id = current_setting('p4.a_message')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'other user edited message'; end if;
  update public.messages set deleted_at = now() where id = current_setting('p4.a_message')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'other user deleted message'; end if;
  begin update public.messages set author_id = auth.uid() where id = current_setting('p4.a_message')::uuid;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'author reassignment allowed'; end if;
  denied := false;
  begin update public.messages set conversation_id = current_setting('p4.private')::uuid
    where id = current_setting('p4.b_message')::uuid;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'message move allowed'; end if;
  if exists (select 1 from public.messages where id = current_setting('p4.d_message')::uuid) then raise exception 'private message leaked'; end if;
end $$;
select public.mark_channel_read(current_setting('p4.public')::uuid, current_setting('p4.b_message')::uuid);
do $$ begin
  if not exists (select 1 from public.conversation_reads where conversation_id = current_setting('p4.public')::uuid and user_id = auth.uid()) then
    raise exception 'read cursor not saved'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
update public.messages set deleted_at = now() where id = current_setting('p4.a_message')::uuid;
do $$ begin
  if (select body from public.messages where id = current_setting('p4.a_message')::uuid) <> '' then raise exception 'deleted body leaked'; end if;
  if (select deleted_at from public.messages where id = current_setting('p4.a_message')::uuid) is null then raise exception 'soft delete missing'; end if;
end $$;
insert into public.messages(conversation_id, body)
select current_setting('p4.public')::uuid, 'page ' || n from generate_series(1, 35) n;
do $$ declare count_first integer; count_second integer; combined integer; begin
  with first_page as (
    select id, created_at from public.list_channel_messages(current_setting('p4.public')::uuid, null, null, 10)
  ), cursor_row as (
    select id, created_at from first_page order by created_at, id limit 1
  ), second_page as (
    select id from public.list_channel_messages(current_setting('p4.public')::uuid,
      (select created_at from cursor_row), (select id from cursor_row), 10)
  )
  select (select count(*) from first_page), (select count(*) from second_page),
         (select count(distinct id) from (select id from first_page union all select id from second_page) pages)
  into count_first, count_second, combined;
  if count_first <> 10 or count_second <> 10 or combined <> 20 then raise exception 'cursor pagination overlaps or skips'; end if;
end $$;
select public.remove_private_channel_member(current_setting('p4.private')::uuid, 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4');
do $$ declare denied boolean := false; begin
  begin perform public.remove_private_channel_member(current_setting('p4.private')::uuid,
    'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  exception when others then if sqlerrm = 'last_private_channel_member' then denied := true; else raise; end if; end;
  if not denied then raise exception 'last private member removed'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4', true);
do $$ begin
  if exists (select 1 from public.conversations where id = current_setting('p4.private')::uuid) then raise exception 'removed private member still reads channel'; end if;
  if exists (select 1 from public.messages where id = current_setting('p4.d_message')::uuid) then raise exception 'removed private member still reads message'; end if;
  if nova_private.can_read_realtime_topic('channel:' || current_setting('p4.private')) then raise exception 'removed private member still joins realtime'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select public.remove_workspace_member(current_setting('p4.workspace')::uuid, 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4');
select set_config('request.jwt.claim.sub', 'd4d4d4d4-dddd-4ddd-8ddd-ddddddddddd4', true);
do $$ begin
  if exists (select 1 from public.conversations where id = current_setting('p4.public')::uuid) then raise exception 'removed workspace member reads public channel'; end if;
  if exists (select 1 from public.messages where conversation_id = current_setting('p4.public')::uuid) then raise exception 'removed workspace member reads messages'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('conversations','conversation_members','conversation_reads','messages') and not c.relrowsecurity) then
    raise exception 'Phase 4 RLS disabled'; end if;
  if has_table_privilege('anon','public.messages','SELECT')
    or has_table_privilege('anon','public.conversations','SELECT')
    or has_table_privilege('authenticated','public.conversation_members','INSERT')
    or has_table_privilege('authenticated','public.messages','DELETE') then
    raise exception 'Phase 4 grants too broad'; end if;
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages'
    and policyname='Channel members receive message notices') then raise exception 'Realtime policy missing'; end if;
end $$;
set local role anon;
do $$ declare denied boolean := false; begin
  begin perform 1 from public.conversations limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anonymous channel read succeeded'; end if;
end $$;
reset role;
rollback;
