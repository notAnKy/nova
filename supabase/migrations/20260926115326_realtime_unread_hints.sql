-- One private, user-scoped hint per current reader after a root message commits.
-- The client re-reads durable conversation/read rows under its own RLS permissions.
create function nova_private.broadcast_unread_hint()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  recipient record;
begin
  if new.parent_message_id is not null then return null; end if;
  for recipient in
    select wm.user_id, c.workspace_id
    from public.conversations c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = new.conversation_id
      and (c.kind = 'public_channel' or exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c.id and cm.user_id = wm.user_id
      ))
  loop
    perform realtime.send(
      jsonb_build_object('workspace_id', recipient.workspace_id,
                         'conversation_id', new.conversation_id),
      'conversation.changed', 'activity:' || recipient.user_id::text, true
    );
  end loop;
  return null;
end;
$$;

create trigger broadcast_unread_hint after insert on public.messages
for each row execute function nova_private.broadcast_unread_hint();

revoke execute on function nova_private.broadcast_unread_hint()
  from public, anon, authenticated;
