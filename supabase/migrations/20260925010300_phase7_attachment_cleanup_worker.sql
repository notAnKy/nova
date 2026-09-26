-- A narrow, hourly Storage API worker removes abandoned objects even when an uploader never returns.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table nova_private.attachment_cleanup_config (
  id boolean primary key default true check (id),
  token text not null default encode(extensions.gen_random_bytes(32),'hex')
);
insert into nova_private.attachment_cleanup_config(id) values(true);
revoke all on nova_private.attachment_cleanup_config from public,anon,authenticated;

create function public.verify_attachment_cleanup_token(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nova_private.attachment_cleanup_config
    where id and token = p_token and p_token is not null and length(p_token) = 64);
$$;
create function public.list_stale_attachments(p_limit integer default 100)
returns table(storage_path text) language sql stable security definer set search_path = '' as $$
  select a.storage_path from public.message_attachments a
  where a.state = 'deleting' or (a.state = 'pending' and a.created_at < now() - interval '1 hour')
  order by a.created_at limit greatest(1,least(coalesce(p_limit,100),100));
$$;
create function public.forget_cleaned_attachment(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_attachments a where a.storage_path = p_path
    and (a.state = 'deleting' or (a.state = 'pending' and a.created_at < now() - interval '1 hour'))
    and not exists (select 1 from storage.objects o
      where o.bucket_id = 'conversation-attachments' and o.name = p_path);
end; $$;
revoke execute on function public.verify_attachment_cleanup_token(text),
  public.list_stale_attachments(integer),public.forget_cleaned_attachment(text)
  from public,anon,authenticated;
grant execute on function public.verify_attachment_cleanup_token(text),
  public.list_stale_attachments(integer),public.forget_cleaned_attachment(text)
  to service_role;
