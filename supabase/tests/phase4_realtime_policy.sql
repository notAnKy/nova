-- Run after a WebSocket client has initialized Realtime's daily partitions.
-- All users, channels, messages, and broadcasts in this test roll back.
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('a5a5a5a5-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-realtime-a@example.invalid', '', now()),
  ('b5b5b5b5-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-realtime-b@example.invalid', '', now()),
  ('d5d5d5d5-dddd-4ddd-8ddd-ddddddddddd4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4-realtime-d@example.invalid', '', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5a5a5a5-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select set_config('p4rt.workspace', public.create_workspace('Realtime policy test', 'phase4-realtime-test')->>'id', true);
select set_config('p4rt.channel', public.create_channel(current_setting('p4rt.workspace')::uuid, 'Private', 'private', '', 'private_channel')->>'id', true);
select set_config('p4rt.invite_b', public.create_workspace_invitation(current_setting('p4rt.workspace')::uuid, 'member', 24, 1)->>'token', true);
select set_config('p4rt.invite_d', public.create_workspace_invitation(current_setting('p4rt.workspace')::uuid, 'member', 24, 1)->>'token', true);

select set_config('request.jwt.claim.sub', 'b5b5b5b5-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
select public.accept_workspace_invitation(current_setting('p4rt.invite_b'));
select set_config('request.jwt.claim.sub', 'd5d5d5d5-dddd-4ddd-8ddd-ddddddddddd4', true);
select public.accept_workspace_invitation(current_setting('p4rt.invite_d'));
select set_config('request.jwt.claim.sub', 'a5a5a5a5-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select public.add_private_channel_member(current_setting('p4rt.channel')::uuid, 'd5d5d5d5-dddd-4ddd-8ddd-ddddddddddd4');

select set_config('request.jwt.claim.sub', 'd5d5d5d5-dddd-4ddd-8ddd-ddddddddddd4', true);
with inserted as (
  insert into public.messages (conversation_id, body)
  values (current_setting('p4rt.channel')::uuid, 'Message body must stay in Postgres')
  returning id
)
select set_config('p4rt.message', id::text, true) from inserted;
select set_config('realtime.topic', 'channel:' || current_setting('p4rt.channel'), true);

do $$ begin
  if not exists (select 1 from realtime.messages
    where topic = realtime.topic() and event = 'message.created' and private
      and extension = 'broadcast' and payload->>'message_id' = current_setting('p4rt.message')
      and payload->>'conversation_id' = current_setting('p4rt.channel')) then
    raise exception 'private member cannot receive created notice';
  end if;
  if exists (select 1 from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')
      and (payload ? 'body' or payload ? 'author_id' or payload ? 'email')) then
    raise exception 'broadcast leaked message content or author data';
  end if;
end $$;
update public.messages set body = 'Updated body stays in Postgres'
where id = current_setting('p4rt.message')::uuid;
update public.messages set deleted_at = now()
where id = current_setting('p4rt.message')::uuid;
do $$ begin
  if (select count(distinct event) from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')
      and event in ('message.created', 'message.updated', 'message.deleted')) <> 3 then
    raise exception 'missing created, updated, or deleted broadcast';
  end if;
  if exists (select 1 from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')
      and (payload ? 'body' or payload ? 'author_id' or payload ? 'email')) then
    raise exception 'edit or delete broadcast leaked message content or author data';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'b5b5b5b5-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
do $$ begin
  if exists (select 1 from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')) then
    raise exception 'workspace member without private membership received notice';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a5a5a5a5-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
do $$ begin
  if not exists (select 1 from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')) then
    raise exception 'private-channel creator cannot receive notice';
  end if;
end $$;
select public.remove_private_channel_member(current_setting('p4rt.channel')::uuid, 'd5d5d5d5-dddd-4ddd-8ddd-ddddddddddd4');
select set_config('request.jwt.claim.sub', 'd5d5d5d5-dddd-4ddd-8ddd-ddddddddddd4', true);
do $$ begin
  if exists (select 1 from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')) then
    raise exception 'removed private member still receives notice';
  end if;
end $$;

reset role;
set local role anon;
do $$ begin
  if exists (select 1 from realtime.messages
    where topic = realtime.topic() and payload->>'message_id' = current_setting('p4rt.message')) then
    raise exception 'anonymous user received private notice';
  end if;
end $$;
reset role;
rollback;
