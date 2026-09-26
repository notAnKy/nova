-- Retryable object cleanup and one conversation hint after attachment finalization.
create function public.list_my_attachment_cleanup(p_limit integer default 20)
returns table(storage_path text) language sql stable security definer set search_path = '' as $$
  select a.storage_path from public.message_attachments a
  where a.uploader_id = auth.uid()
    and (a.state = 'deleting' or (a.state = 'pending' and a.created_at < now() - interval '15 minutes'))
  order by a.created_at limit greatest(1,least(coalesce(p_limit,20),20));
$$;
revoke execute on function public.list_my_attachment_cleanup(integer) from public,anon,authenticated;
grant execute on function public.list_my_attachment_cleanup(integer) to authenticated;

create function nova_private.broadcast_attachment_ready()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.state = 'pending' and new.state = 'ready' then
    perform realtime.send(jsonb_build_object('message_id',new.message_id,
      'conversation_id',new.conversation_id), 'message.updated',
      'channel:' || new.conversation_id::text, true);
  end if;
  return null;
end; $$;
create trigger broadcast_attachment_ready after update of state on public.message_attachments
for each row execute function nova_private.broadcast_attachment_ready();
revoke execute on function nova_private.broadcast_attachment_ready() from public,anon,authenticated;
