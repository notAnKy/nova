-- Freeze uploaded objects while a trusted Edge Function checks the stored bytes.
-- The browser can reserve and INSERT only while pending; it cannot mark files ready.
alter table public.message_attachments drop constraint message_attachments_state_check;
alter table public.message_attachments add constraint message_attachments_state_check
  check (state in ('pending','validating','ready','deleting','expired'));

create function nova_private.begin_attachment_validation(p_message_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_message public.messages%rowtype;
begin
  if p_actor_id is null then raise exception 'authentication_required'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  select * into v_message from public.messages where id = p_message_id for update;
  if v_message.id is null or v_message.author_id <> p_actor_id or v_message.deleted_at is not null
     or not nova_private.can_read_conversation(v_message.conversation_id) then
    raise exception 'message_not_available';
  end if;
  if (select count(*) from public.message_attachments where message_id = p_message_id) not between 1 and 3
     or exists (select 1 from public.message_attachments
       where message_id = p_message_id and state <> 'pending') then
    raise exception 'attachments_not_pending';
  end if;
  update public.message_attachments set state = 'validating'
    where message_id = p_message_id and state = 'pending';
end; $$;

create function nova_private.finalize_validated_attachments(p_message_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_message public.messages%rowtype;
begin
  if p_actor_id is null then raise exception 'authentication_required'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  select * into v_message from public.messages where id = p_message_id for update;
  if v_message.id is null or v_message.author_id <> p_actor_id or v_message.deleted_at is not null
     or not nova_private.can_read_conversation(v_message.conversation_id) then
    raise exception 'message_not_available';
  end if;
  if (select count(*) from public.message_attachments where message_id = p_message_id) not between 1 and 3
     or exists (select 1 from public.message_attachments
       where message_id = p_message_id and state <> 'validating')
     or exists (select 1 from public.message_attachments a where a.message_id = p_message_id
       and not exists (select 1 from storage.objects o
         where o.bucket_id = 'conversation-attachments' and o.name = a.storage_path)) then
    raise exception 'attachment_validation_incomplete';
  end if;
  update public.message_attachments
    set state = 'ready', expires_at = clock_timestamp() + interval '72 hours'
    where message_id = p_message_id and state = 'validating';
end; $$;

create function public.begin_attachment_validation(p_message_id uuid, p_actor_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select nova_private.begin_attachment_validation(p_message_id, p_actor_id); $$;
create function public.finalize_validated_attachments(p_message_id uuid, p_actor_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select nova_private.finalize_validated_attachments(p_message_id, p_actor_id); $$;

revoke execute on function public.finish_attachments(uuid), nova_private.finish_attachments(uuid)
  from public, anon, authenticated;
revoke execute on function public.begin_attachment_validation(uuid,uuid),
  public.finalize_validated_attachments(uuid,uuid),
  nova_private.begin_attachment_validation(uuid,uuid),
  nova_private.finalize_validated_attachments(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_attachment_validation(uuid,uuid),
  public.finalize_validated_attachments(uuid,uuid),
  nova_private.begin_attachment_validation(uuid,uuid),
  nova_private.finalize_validated_attachments(uuid,uuid)
  to service_role;
grant usage on schema nova_private to service_role;

-- If validation is interrupted, the existing hourly worker removes the frozen
-- object through the Storage API after one hour.
create or replace function public.list_stale_attachments(p_limit integer default 100)
returns table(storage_path text) language sql stable security definer set search_path = '' as $$
  select a.storage_path from public.message_attachments a
  where a.state = 'deleting'
    or (a.state in ('pending','validating') and a.created_at < now() - interval '1 hour')
    or (a.state = 'ready' and a.expires_at <= now())
  order by a.created_at limit greatest(1,least(coalesce(p_limit,100),100));
$$;
create or replace function public.forget_cleaned_attachment(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.message_attachments a set state = 'expired'
    where a.storage_path = p_path and a.state = 'ready' and a.expires_at <= now()
      and not exists (select 1 from storage.objects o
        where o.bucket_id = 'conversation-attachments' and o.name = p_path);
  delete from public.message_attachments a where a.storage_path = p_path
    and (a.state = 'deleting' or (a.state in ('pending','validating')
      and a.created_at < now() - interval '1 hour'))
    and not exists (select 1 from storage.objects o
      where o.bucket_id = 'conversation-attachments' and o.name = p_path);
end; $$;
