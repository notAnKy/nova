-- Keep the narrow caller-checked cleanup reader outside the exposed API schema.
create function nova_private.list_my_attachment_cleanup(p_limit integer)
returns table(storage_path text) language sql stable security definer set search_path = '' as $$
  select a.storage_path from public.message_attachments a
  where a.uploader_id = auth.uid()
    and (a.state = 'deleting' or (a.state = 'pending' and a.created_at < now() - interval '15 minutes'))
  order by a.created_at limit greatest(1,least(coalesce(p_limit,20),20));
$$;
create or replace function public.list_my_attachment_cleanup(p_limit integer default 20)
returns table(storage_path text) language sql stable security invoker set search_path = '' as $$
  select * from nova_private.list_my_attachment_cleanup(p_limit);
$$;
revoke execute on function nova_private.list_my_attachment_cleanup(integer) from public,anon,authenticated;
grant execute on function nova_private.list_my_attachment_cleanup(integer) to authenticated;

create index message_attachments_by_conversation on public.message_attachments(conversation_id);
