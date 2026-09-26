-- Phase 4: channels and durable plain-text messages. DM kinds are deferred.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('public_channel', 'private_channel')),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' and slug !~ '--'),
  topic text not null default '' check (char_length(topic) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_id uuid,
  unique (workspace_id, slug),
  unique (workspace_id, id)
);
create index conversations_by_workspace on public.conversations(workspace_id, created_at);

create table public.conversation_members (
  workspace_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  foreign key (workspace_id, conversation_id) references public.conversations(workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create index conversation_members_by_user on public.conversation_members(user_id, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
    or (deleted_at is not null and body = '')
  )
);
create index messages_page on public.messages(conversation_id, created_at desc, id desc);
create index messages_by_author on public.messages(author_id);

create table public.conversation_reads (
  workspace_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_created_at timestamptz not null,
  last_read_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  foreign key (workspace_id, conversation_id) references public.conversations(workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create index conversation_reads_by_user on public.conversation_reads(user_id, conversation_id);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

revoke all on public.conversations, public.conversation_members, public.messages, public.conversation_reads
  from public, anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.conversation_reads
  to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;
grant update (body, deleted_at) on public.messages to authenticated;

create function nova_private.can_read_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id and wm.user_id = (select auth.uid())
    where c.id = p_conversation_id
      and (c.kind = 'public_channel' or exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c.id and cm.user_id = (select auth.uid())
      ))
  );
$$;

create policy "Visible channels" on public.conversations for select to authenticated
using (nova_private.can_read_conversation(id));
create policy "Visible private channel roster" on public.conversation_members for select to authenticated
using (nova_private.can_read_conversation(conversation_id));
create policy "Visible messages" on public.messages for select to authenticated
using (nova_private.can_read_conversation(conversation_id));
create policy "Send to visible channel as self" on public.messages for insert to authenticated
with check (author_id = (select auth.uid()) and nova_private.can_read_conversation(conversation_id)
  and deleted_at is null and edited_at is null);
create policy "Edit own visible messages" on public.messages for update to authenticated
using (author_id = (select auth.uid()) and deleted_at is null
  and nova_private.can_read_conversation(conversation_id))
with check (author_id = (select auth.uid()) and nova_private.can_read_conversation(conversation_id));
create policy "Read own cursors" on public.conversation_reads for select to authenticated
using (user_id = (select auth.uid()) and nova_private.can_read_conversation(conversation_id));

create function nova_private.protect_message_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.conversation_id is distinct from old.conversation_id
     or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'immutable_message_fields';
  end if;
  if old.deleted_at is not null then raise exception 'message_deleted'; end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.edited_at := old.edited_at;
  elsif new.body is distinct from old.body then
    if char_length(btrim(new.body)) not between 1 and 4000 then raise exception 'invalid_message_body'; end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;
create trigger protect_message_update before update on public.messages
for each row execute function nova_private.protect_message_update();

create function nova_private.keep_private_channel_member()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.conversation_members
      where conversation_id = old.conversation_id) <= 1 then
    raise exception 'last_private_channel_member';
  end if;
  return old;
end;
$$;
create trigger keep_private_channel_member before delete on public.conversation_members
for each row execute function nova_private.keep_private_channel_member();

create function nova_private.touch_conversation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger touch_conversation before update on public.conversations
for each row execute function nova_private.touch_conversation();

create function nova_private.broadcast_message_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.conversations
      set last_message_at = new.created_at, last_message_id = new.id
      where id = new.conversation_id
        and (last_message_at is null or (last_message_at, last_message_id) < (new.created_at, new.id));
  end if;
  perform realtime.send(
    jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id),
    case when tg_op = 'INSERT' then 'message.created'
         when new.deleted_at is not null then 'message.deleted'
         else 'message.updated' end,
    'channel:' || new.conversation_id::text,
    true
  );
  return null;
end;
$$;
create trigger broadcast_message_change after insert or update on public.messages
for each row execute function nova_private.broadcast_message_change();

create function nova_private.create_channel(
  p_workspace_id uuid, p_name text, p_slug text, p_topic text, p_kind text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(p_name);
  v_topic text := btrim(coalesce(p_topic, ''));
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if coalesce(nova_private.member_role(p_workspace_id), '') not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 80 then raise exception 'invalid_channel_name'; end if;
  if p_slug is null or p_slug <> lower(btrim(p_slug))
     or p_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' or p_slug ~ '--' then
    raise exception 'invalid_channel_slug';
  end if;
  if char_length(v_topic) > 500 then raise exception 'invalid_channel_topic'; end if;
  if p_kind is null or p_kind not in ('public_channel', 'private_channel') then
    raise exception 'invalid_channel_kind';
  end if;
  insert into public.conversations(workspace_id, kind, name, slug, topic, created_by)
    values (p_workspace_id, p_kind, v_name, p_slug, v_topic, auth.uid())
    returning id into v_id;
  if p_kind = 'private_channel' then
    insert into public.conversation_members(workspace_id, conversation_id, user_id)
      values (p_workspace_id, v_id, auth.uid());
  end if;
  return jsonb_build_object('id', v_id, 'slug', p_slug);
end;
$$;

create function nova_private.add_private_channel_member(p_conversation_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_channel public.conversations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_channel from public.conversations where id = p_conversation_id for update;
  if v_channel.id is null then raise exception 'channel_not_found'; end if;
  if v_channel.kind <> 'private_channel' then raise exception 'not_private_channel'; end if;
  if not nova_private.can_read_conversation(p_conversation_id)
     or coalesce(nova_private.member_role(v_channel.workspace_id), '') not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;
  if not exists (select 1 from public.workspace_members
                 where workspace_id = v_channel.workspace_id and user_id = p_user_id) then
    raise exception 'member_not_found';
  end if;
  insert into public.conversation_members(workspace_id, conversation_id, user_id)
    values (v_channel.workspace_id, p_conversation_id, p_user_id)
    on conflict (conversation_id, user_id) do nothing;
  return jsonb_build_object('user_id', p_user_id);
end;
$$;

create function nova_private.remove_private_channel_member(p_conversation_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_channel public.conversations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_channel from public.conversations where id = p_conversation_id for update;
  if v_channel.id is null then raise exception 'channel_not_found'; end if;
  if v_channel.kind <> 'private_channel' then raise exception 'not_private_channel'; end if;
  if not nova_private.can_read_conversation(p_conversation_id)
     or coalesce(nova_private.member_role(v_channel.workspace_id), '') not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;
  delete from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id;
  if not found then raise exception 'channel_member_not_found'; end if;
  delete from public.conversation_reads
    where conversation_id = p_conversation_id and user_id = p_user_id;
  return jsonb_build_object('user_id', p_user_id);
end;
$$;

create function nova_private.mark_channel_read(p_conversation_id uuid, p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not nova_private.can_read_conversation(p_conversation_id) then raise exception 'permission_denied'; end if;
  select workspace_id into v_workspace_id from public.conversations where id = p_conversation_id;
  select created_at into v_created_at from public.messages
    where conversation_id = p_conversation_id and id = p_message_id;
  if v_created_at is null then raise exception 'message_not_found'; end if;
  insert into public.conversation_reads
    (workspace_id, conversation_id, user_id, last_read_created_at, last_read_id)
    values (v_workspace_id, p_conversation_id, auth.uid(), v_created_at, p_message_id)
    on conflict (conversation_id, user_id) do update
      set last_read_created_at = excluded.last_read_created_at,
          last_read_id = excluded.last_read_id,
          updated_at = now()
      where (conversation_reads.last_read_created_at, conversation_reads.last_read_id)
          < (excluded.last_read_created_at, excluded.last_read_id);
  return jsonb_build_object('read', true);
end;
$$;

create function public.create_channel(
  p_workspace_id uuid, p_name text, p_slug text, p_topic text, p_kind text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.create_channel(p_workspace_id, p_name, p_slug, p_topic, p_kind); $$;
create function public.add_private_channel_member(p_conversation_id uuid, p_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.add_private_channel_member(p_conversation_id, p_user_id); $$;
create function public.remove_private_channel_member(p_conversation_id uuid, p_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.remove_private_channel_member(p_conversation_id, p_user_id); $$;
create function public.mark_channel_read(p_conversation_id uuid, p_message_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.mark_channel_read(p_conversation_id, p_message_id); $$;

create function public.list_channel_messages(
  p_conversation_id uuid, p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 31
)
returns setof public.messages language sql stable security invoker set search_path = ''
as $$
  select m.* from public.messages m
  where m.conversation_id = p_conversation_id
    and ((p_before_created_at is null and p_before_id is null)
      or (p_before_created_at is not null and p_before_id is not null
        and (m.created_at, m.id) < (p_before_created_at, p_before_id)))
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 31), 51));
$$;

create function nova_private.can_read_realtime_topic(p_topic text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_topic ~ '^channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then nova_private.can_read_conversation(substring(p_topic from 9)::uuid)
    else false
  end;
$$;
create policy "Channel members receive message notices"
on realtime.messages for select to authenticated
using (extension = 'broadcast'
  and nova_private.can_read_realtime_topic((select realtime.topic())));

revoke execute on function
  nova_private.can_read_conversation(uuid),
  nova_private.protect_message_update(),
  nova_private.keep_private_channel_member(),
  nova_private.touch_conversation(),
  nova_private.broadcast_message_change(),
  nova_private.create_channel(uuid, text, text, text, text),
  nova_private.add_private_channel_member(uuid, uuid),
  nova_private.remove_private_channel_member(uuid, uuid),
  nova_private.mark_channel_read(uuid, uuid),
  nova_private.can_read_realtime_topic(text)
from public, anon, authenticated;
grant execute on function
  nova_private.can_read_conversation(uuid),
  nova_private.create_channel(uuid, text, text, text, text),
  nova_private.add_private_channel_member(uuid, uuid),
  nova_private.remove_private_channel_member(uuid, uuid),
  nova_private.mark_channel_read(uuid, uuid),
  nova_private.can_read_realtime_topic(text)
to authenticated;

revoke execute on function
  public.create_channel(uuid, text, text, text, text),
  public.add_private_channel_member(uuid, uuid),
  public.remove_private_channel_member(uuid, uuid),
  public.mark_channel_read(uuid, uuid),
  public.list_channel_messages(uuid, timestamptz, uuid, integer)
from public, anon, authenticated;
grant execute on function
  public.create_channel(uuid, text, text, text, text),
  public.add_private_channel_member(uuid, uuid),
  public.remove_private_channel_member(uuid, uuid),
  public.mark_channel_read(uuid, uuid),
  public.list_channel_messages(uuid, timestamptz, uuid, integer)
to authenticated;
