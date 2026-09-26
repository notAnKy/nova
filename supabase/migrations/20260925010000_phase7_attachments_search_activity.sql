-- Phase 7: private message files, workspace-scoped search, and durable activity.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conversation-attachments', 'conversation-attachments', false, 10485760,
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf',
        'text/plain','text/markdown','text/csv','application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/gif',
    'application/pdf','text/plain','text/markdown','text/csv','application/json')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  state text not null default 'pending' check (state in ('pending','ready','deleting')),
  created_at timestamptz not null default now(),
  check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
create index message_attachments_by_message on public.message_attachments(message_id) where state = 'ready';
create index message_attachments_cleanup on public.message_attachments(uploader_id, created_at)
  where state <> 'ready';
alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from public, anon, authenticated;
grant select on public.message_attachments to authenticated;
create policy "Read live authorized attachments" on public.message_attachments for select to authenticated
using (state = 'ready' and exists (select 1 from public.messages m
  where m.id = message_id and m.conversation_id = message_attachments.conversation_id
    and m.deleted_at is null and nova_private.can_read_conversation(m.conversation_id)));

-- Only the file owner can reserve a path, and every reservation is bound to a live own message.
create function nova_private.reserve_attachment(p_message_id uuid, p_object_id uuid,
  p_name text, p_mime text, p_size integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_message public.messages%rowtype; v_workspace uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_message from public.messages where id = p_message_id for update;
  if v_message.id is null or v_message.author_id <> auth.uid() or v_message.deleted_at is not null
     or not nova_private.can_read_conversation(v_message.conversation_id) then
    raise exception 'message_not_available';
  end if;
  if p_object_id is null or char_length(coalesce(p_name,'')) not between 1 and 255
     or p_mime not in ('image/png','image/jpeg','image/webp','image/gif','application/pdf',
       'text/plain','text/markdown','text/csv','application/json')
     or p_size not between 1 and 10485760 then raise exception 'invalid_attachment'; end if;
  if (select count(*) from public.message_attachments where message_id = p_message_id) >= 3
     or (select coalesce(sum(size_bytes),0) from public.message_attachments where message_id = p_message_id)
        + p_size > 15728640 then raise exception 'attachment_limit'; end if;
  select workspace_id into v_workspace from public.conversations where id = v_message.conversation_id;
  insert into public.message_attachments(message_id, conversation_id, uploader_id,
    storage_path, original_name, mime_type, size_bytes)
  values (p_message_id, v_message.conversation_id, auth.uid(),
    v_workspace::text || '/' || v_message.conversation_id::text || '/' || p_object_id::text,
    p_name, p_mime, p_size) returning id into v_id;
  return v_id;
end; $$;

create function nova_private.finish_attachments(p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.messages m where m.id = p_message_id and
    m.author_id = auth.uid() and m.deleted_at is null and nova_private.can_read_conversation(m.conversation_id))
    then raise exception 'message_not_available'; end if;
  if exists (select 1 from public.message_attachments a where a.message_id = p_message_id
    and a.state = 'pending' and not exists (select 1 from storage.objects o
      where o.bucket_id = 'conversation-attachments' and o.name = a.storage_path))
    then raise exception 'upload_incomplete'; end if;
  update public.message_attachments set state = 'ready'
    where message_id = p_message_id and state = 'pending';
end; $$;

create function nova_private.can_use_attachment_object(p_path text, p_operation text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_attachments a
    join public.messages m on m.id = a.message_id
    where a.storage_path = p_path
      and case p_operation
        when 'insert' then a.state = 'pending' and a.uploader_id = auth.uid()
          and m.deleted_at is null and nova_private.can_read_conversation(a.conversation_id)
        when 'select' then (a.state = 'ready' and m.deleted_at is null
          and nova_private.can_read_conversation(a.conversation_id))
          or (a.state in ('pending','deleting') and a.uploader_id = auth.uid())
        when 'delete' then a.state in ('pending','deleting') and a.uploader_id = auth.uid()
        else false end);
$$;
create policy "Reserved authorized attachment uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'conversation-attachments' and owner_id = (select auth.uid())::text
  and nova_private.can_use_attachment_object(name, 'insert'));
create policy "Authorized attachment downloads" on storage.objects for select to authenticated
using (bucket_id = 'conversation-attachments'
  and nova_private.can_use_attachment_object(name, 'select'));
create policy "Clean up own pending attachments" on storage.objects for delete to authenticated
using (bucket_id = 'conversation-attachments'
  and nova_private.can_use_attachment_object(name, 'delete'));

create function nova_private.queue_deleted_attachments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.message_attachments set state = 'deleting' where message_id = new.id;
  end if;
  return null;
end; $$;
create trigger queue_deleted_attachments after update of deleted_at on public.messages
for each row execute function nova_private.queue_deleted_attachments();
create function nova_private.forget_removed_attachment(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_attachments a where a.storage_path = p_path
    and a.uploader_id = auth.uid() and a.state in ('pending','deleting')
    and not exists (select 1 from storage.objects o where o.bucket_id = 'conversation-attachments' and o.name = p_path);
end; $$;
create function public.reserve_attachment(p_message_id uuid,p_object_id uuid,p_name text,p_mime text,p_size integer)
returns uuid language sql security invoker set search_path = '' as $$
  select nova_private.reserve_attachment(p_message_id,p_object_id,p_name,p_mime,p_size); $$;
create function public.finish_attachments(p_message_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select nova_private.finish_attachments(p_message_id); $$;
create function public.forget_removed_attachment(p_path text)
returns void language sql security invoker set search_path = '' as $$
  select nova_private.forget_removed_attachment(p_path); $$;
revoke execute on function nova_private.reserve_attachment(uuid,uuid,text,text,integer),
  nova_private.finish_attachments(uuid), nova_private.can_use_attachment_object(text,text),
  nova_private.queue_deleted_attachments(), nova_private.forget_removed_attachment(text)
  from public,anon,authenticated;
grant execute on function nova_private.reserve_attachment(uuid,uuid,text,text,integer),
  nova_private.finish_attachments(uuid), nova_private.can_use_attachment_object(text,text),
  nova_private.forget_removed_attachment(text) to authenticated;
revoke execute on function public.reserve_attachment(uuid,uuid,text,text,integer),
  public.finish_attachments(uuid), public.forget_removed_attachment(text) from public,anon,authenticated;
grant execute on function public.reserve_attachment(uuid,uuid,text,text,integer),
  public.finish_attachments(uuid), public.forget_removed_attachment(text) to authenticated;

-- Search runs as the caller; messages and conversations RLS remain the authority.
alter table public.messages add column search_vector tsvector
  generated always as (to_tsvector('simple'::regconfig, coalesce(body,''))) stored;
create index messages_search_live on public.messages using gin(search_vector)
  where deleted_at is null;
create function public.search_messages(p_workspace_id uuid,p_query text,p_limit integer default 30)
returns table(id uuid,conversation_id uuid,author_id uuid,body text,created_at timestamptz,
  parent_message_id uuid,conversation_kind text,conversation_name text,conversation_slug text)
language sql stable security invoker set search_path = '' as $$
  select m.id,m.conversation_id,m.author_id,m.body,m.created_at,m.parent_message_id,
    c.kind,c.name,c.slug
  from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.workspace_id = p_workspace_id and m.deleted_at is null
    and char_length(coalesce(p_query,'')) between 2 and 100
    and m.search_vector @@ websearch_to_tsquery('simple'::regconfig,p_query)
  order by m.created_at desc,m.id desc
  limit greatest(1,least(coalesce(p_limit,30),30)); $$;
revoke execute on function public.search_messages(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.search_messages(uuid,text,integer) to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mention','thread_reply')),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,message_id,kind)
);
create index notifications_inbox on public.notifications(recipient_id,workspace_id,created_at desc,id desc);
create index notifications_unread on public.notifications(recipient_id,workspace_id)
  where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "Read own authorized activity" on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()) and nova_private.can_read_conversation(conversation_id)
  and exists (select 1 from public.messages m where m.id = message_id and m.deleted_at is null));
create policy "Mark own authorized activity read" on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) and nova_private.can_read_conversation(conversation_id))
with check (recipient_id = (select auth.uid()) and nova_private.can_read_conversation(conversation_id));
create function nova_private.protect_notification_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.recipient_id,new.workspace_id,new.actor_id,new.kind,new.conversation_id,
    new.message_id,new.created_at) is distinct from row(old.id,old.recipient_id,old.workspace_id,
    old.actor_id,old.kind,old.conversation_id,old.message_id,old.created_at) then
    raise exception 'immutable_notification'; end if;
  if new.read_at is null then raise exception 'cannot_unread_notification'; end if;
  if old.read_at is not null then new.read_at := old.read_at;
  else new.read_at := now(); end if;
  return new;
end; $$;
create trigger protect_notification_update before update on public.notifications
for each row execute function nova_private.protect_notification_update();

create function nova_private.recipient_can_read(p_conversation_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id and wm.user_id = p_user_id
    where c.id = p_conversation_id and (c.kind = 'public_channel' or exists
      (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = p_user_id)));
$$;
create function nova_private.zz_generate_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_root_author uuid;
begin
  if new.deleted_at is not null then return null; end if;
  select workspace_id into v_workspace from public.conversations where id = new.conversation_id;
  insert into public.notifications(recipient_id,workspace_id,actor_id,kind,conversation_id,message_id)
    select mm.user_id,v_workspace,new.author_id,'mention',new.conversation_id,new.id
    from public.message_mentions mm where mm.message_id = new.id and mm.user_id <> new.author_id
      and nova_private.recipient_can_read(new.conversation_id,mm.user_id)
    on conflict (recipient_id,message_id,kind) do nothing;
  if new.parent_message_id is not null and tg_op = 'INSERT' then
    select author_id into v_root_author from public.messages where id = new.parent_message_id;
    if v_root_author is not null and v_root_author <> new.author_id
       and nova_private.recipient_can_read(new.conversation_id,v_root_author) then
      insert into public.notifications(recipient_id,workspace_id,actor_id,kind,conversation_id,message_id)
        values(v_root_author,v_workspace,new.author_id,'thread_reply',new.conversation_id,new.id)
        on conflict (recipient_id,message_id,kind) do nothing;
    end if;
  end if;
  return null;
end; $$;
create trigger zz_generate_activity after insert or update of body on public.messages
for each row execute function nova_private.zz_generate_activity();
create function nova_private.broadcast_activity_hint()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('workspace_id',new.workspace_id),
    'activity.changed','activity:' || new.recipient_id::text,true);
  return null;
end; $$;
create trigger broadcast_activity_hint after insert or update of read_at on public.notifications
for each row execute function nova_private.broadcast_activity_hint();
create function nova_private.can_read_activity_topic(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_topic = 'activity:' || auth.uid()::text;
$$;
create policy "Receive own activity hints" on realtime.messages for select to authenticated
using (extension = 'broadcast' and nova_private.can_read_activity_topic((select realtime.topic())));
revoke execute on function nova_private.protect_notification_update(),
  nova_private.recipient_can_read(uuid,uuid),nova_private.zz_generate_activity(),
  nova_private.broadcast_activity_hint(),nova_private.can_read_activity_topic(text)
  from public,anon,authenticated;
grant execute on function nova_private.can_read_activity_topic(text) to authenticated;
