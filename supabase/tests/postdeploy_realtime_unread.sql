-- Transactional fanout test. Run as postgres against the migrated local database.
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('e1e1e1e1-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ux-a@example.invalid', '', now()),
  ('e2e2e2e2-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ux-b@example.invalid', '', now()),
  ('e3e3e3e3-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ux-c@example.invalid', '', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1e1e1e1-1111-4111-8111-111111111111', true);
select set_config('ux.workspace', public.create_workspace('Unread hints', 'ux-unread-hints')->>'id', true);
select set_config('ux.public', public.create_channel(current_setting('ux.workspace')::uuid, 'General', 'general', '', 'public_channel')->>'id', true);
select set_config('ux.private', public.create_channel(current_setting('ux.workspace')::uuid, 'Secret', 'secret', '', 'private_channel')->>'id', true);
select set_config('ux.invite_b', public.create_workspace_invitation(current_setting('ux.workspace')::uuid, 'member', 24, 1)->>'token', true);
select set_config('ux.invite_c', public.create_workspace_invitation(current_setting('ux.workspace')::uuid, 'member', 24, 1)->>'token', true);
select set_config('request.jwt.claim.sub', 'e2e2e2e2-2222-4222-8222-222222222222', true);
select public.accept_workspace_invitation(current_setting('ux.invite_b'));
select set_config('request.jwt.claim.sub', 'e3e3e3e3-3333-4333-8333-333333333333', true);
select public.accept_workspace_invitation(current_setting('ux.invite_c'));
select set_config('request.jwt.claim.sub', 'e1e1e1e1-1111-4111-8111-111111111111', true);
select public.add_private_channel_member(current_setting('ux.private')::uuid, 'e2e2e2e2-2222-4222-8222-222222222222'::uuid);
with root as (insert into public.messages(conversation_id, body)
  values (current_setting('ux.public')::uuid, 'Public root') returning id)
select set_config('ux.root', id::text, true) from root;
insert into public.messages(conversation_id, parent_message_id, body)
values (current_setting('ux.public')::uuid, current_setting('ux.root')::uuid, 'Thread reply');
insert into public.messages(conversation_id, body)
values (current_setting('ux.private')::uuid, 'Private root');

reset role;
do $$
declare
  v_public uuid := current_setting('ux.public')::uuid;
  v_private uuid := current_setting('ux.private')::uuid;
begin
  if (select count(*) from realtime.messages where event = 'conversation.changed'
    and payload->>'conversation_id' = v_public::text
    and topic in ('activity:e1e1e1e1-1111-4111-8111-111111111111',
                  'activity:e2e2e2e2-2222-4222-8222-222222222222',
                  'activity:e3e3e3e3-3333-4333-8333-333333333333')) <> 3 then
    raise exception 'Public root should hint each workspace member exactly once; reply must not hint';
  end if;
  if (select count(*) from realtime.messages where event = 'conversation.changed'
    and payload->>'conversation_id' = v_private::text
    and topic in ('activity:e1e1e1e1-1111-4111-8111-111111111111',
                  'activity:e2e2e2e2-2222-4222-8222-222222222222')) <> 2 then
    raise exception 'Private root should hint current participants';
  end if;
  if exists (select 1 from realtime.messages where event = 'conversation.changed'
    and payload->>'conversation_id' = v_private::text
    and topic = 'activity:e3e3e3e3-3333-4333-8333-333333333333') then
    raise exception 'Private conversation hint leaked to workspace outsider';
  end if;
  if exists (select 1 from public.conversation_reads
    where conversation_id = v_public and user_id = 'e2e2e2e2-2222-4222-8222-222222222222') then
    raise exception 'Realtime hint must not mark a message read';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1e1e1e1-1111-4111-8111-111111111111', true);
select public.remove_private_channel_member(current_setting('ux.private')::uuid,
  'e2e2e2e2-2222-4222-8222-222222222222'::uuid);
insert into public.messages(conversation_id, body)
values (current_setting('ux.private')::uuid, 'After removal');
reset role;
do $$ begin
  if (select count(*) from realtime.messages where event = 'conversation.changed'
    and payload->>'conversation_id' = current_setting('ux.private')
    and topic = 'activity:e1e1e1e1-1111-4111-8111-111111111111') <> 2 then
    raise exception 'Current private participant missed hint';
  end if;
  if (select count(*) from realtime.messages where event = 'conversation.changed'
    and payload->>'conversation_id' = current_setting('ux.private')
    and topic = 'activity:e2e2e2e2-2222-4222-8222-222222222222') <> 1 then
    raise exception 'Removed private participant received hint';
  end if;
end $$;
rollback;
