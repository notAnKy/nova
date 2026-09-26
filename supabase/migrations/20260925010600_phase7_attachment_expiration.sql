-- Message files expire 72 hours after their Storage upload is finalized.
alter table public.message_attachments add column expires_at timestamptz;

-- Historical ready files have no recorded finalization time. Give them a fresh
-- 72-hour window instead of expiring them unexpectedly during this migration.
update public.message_attachments set expires_at = now() + interval '72 hours'
where state = 'ready';

alter table public.message_attachments drop constraint message_attachments_state_check;
alter table public.message_attachments add constraint message_attachments_state_check
  check (state in ('pending','ready','deleting','expired'));
alter table public.message_attachments add constraint message_attachments_ready_expiry_check
  check (state not in ('ready','expired') or expires_at is not null);

drop index public.message_attachments_by_message;
create index message_attachments_by_message on public.message_attachments(message_id);
create index message_attachments_expiring on public.message_attachments(expires_at)
  where state = 'ready';

drop policy "Read live authorized attachments" on public.message_attachments;
create policy "Read live authorized attachments" on public.message_attachments for select to authenticated
using (state in ('ready','expired') and exists (select 1 from public.messages m
  where m.id = message_id and m.conversation_id = message_attachments.conversation_id
    and m.deleted_at is null and nova_private.can_read_conversation(m.conversation_id)));

create or replace function nova_private.finish_attachments(p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_expires_at timestamptz;
begin
  if not exists (select 1 from public.messages m where m.id = p_message_id and
    m.author_id = auth.uid() and m.deleted_at is null and nova_private.can_read_conversation(m.conversation_id))
    then raise exception 'message_not_available'; end if;
  if exists (select 1 from public.message_attachments a where a.message_id = p_message_id
    and a.state = 'pending' and not exists (select 1 from storage.objects o
      where o.bucket_id = 'conversation-attachments' and o.name = a.storage_path))
    then raise exception 'upload_incomplete'; end if;
  v_expires_at := clock_timestamp() + interval '72 hours';
  update public.message_attachments set state = 'ready', expires_at = v_expires_at
    where message_id = p_message_id and state = 'pending';
end; $$;

-- Storage downloads are checked on each request. A stale ready row cannot
-- authorize a download while the hourly worker is still waiting to run.
create or replace function nova_private.can_use_attachment_object(p_path text, p_operation text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_attachments a
    join public.messages m on m.id = a.message_id
    where a.storage_path = p_path
      and case p_operation
        when 'insert' then a.state = 'pending' and a.uploader_id = auth.uid()
          and m.deleted_at is null and nova_private.can_read_conversation(a.conversation_id)
        when 'select' then (a.state = 'ready' and a.expires_at > now()
          and m.deleted_at is null and nova_private.can_read_conversation(a.conversation_id))
          or (a.state in ('pending','deleting') and a.uploader_id = auth.uid()
            and (a.expires_at is null or a.expires_at > now()))
        when 'delete' then a.state in ('pending','deleting') and a.uploader_id = auth.uid()
        else false end);
$$;

create or replace function public.list_stale_attachments(p_limit integer default 100)
returns table(storage_path text) language sql stable security definer set search_path = '' as $$
  select a.storage_path from public.message_attachments a
  where a.state = 'deleting'
    or (a.state = 'pending' and a.created_at < now() - interval '1 hour')
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
    and (a.state = 'deleting' or (a.state = 'pending' and a.created_at < now() - interval '1 hour'))
    and not exists (select 1 from storage.objects o
      where o.bucket_id = 'conversation-attachments' and o.name = p_path);
end; $$;

create or replace function nova_private.broadcast_attachment_ready()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.state = 'pending' and new.state = 'ready')
     or (old.state = 'ready' and new.state = 'expired') then
    perform realtime.send(jsonb_build_object('message_id',new.message_id,
      'conversation_id',new.conversation_id), 'message.updated',
      'channel:' || new.conversation_id::text, true);
  end if;
  return null;
end; $$;
