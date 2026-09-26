-- Replies share their root's conversation and never become nested threads.
alter table public.messages add column parent_message_id uuid;
alter table public.messages add constraint messages_conversation_id_id_unique unique (conversation_id, id);
alter table public.messages add constraint messages_parent_same_conversation
  foreign key (conversation_id, parent_message_id)
  references public.messages(conversation_id, id) on delete no action deferrable initially deferred;
alter table public.messages add constraint messages_not_own_parent
  check (parent_message_id is null or parent_message_id <> id);
create index messages_thread_page on public.messages
  (parent_message_id, created_at desc, id desc) where parent_message_id is not null;
grant insert (parent_message_id) on public.messages to authenticated;

create function nova_private.validate_thread_parent()
returns trigger language plpgsql set search_path = ''
as $$
declare v_parent uuid;
begin
  if new.parent_message_id is null then return new; end if;
  select parent_message_id into v_parent from public.messages
    where conversation_id = new.conversation_id and id = new.parent_message_id
    for key share;
  if not found then raise exception 'thread_root_not_found'; end if;
  if v_parent is not null then raise exception 'nested_thread_not_allowed'; end if;
  return new;
end;
$$;
create trigger validate_thread_parent before insert on public.messages
for each row execute function nova_private.validate_thread_parent();
revoke execute on function nova_private.validate_thread_parent() from public, anon, authenticated;

create or replace function nova_private.protect_message_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.conversation_id is distinct from old.conversation_id
     or new.parent_message_id is distinct from old.parent_message_id
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

-- Only top-level messages affect the conversation's existing read cursor.
create or replace function nova_private.broadcast_message_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.parent_message_id is null then
    update public.conversations
      set last_message_at = new.created_at, last_message_id = new.id
      where id = new.conversation_id
        and (last_message_at is null or (last_message_at, last_message_id) < (new.created_at, new.id));
  end if;
  perform realtime.send(
    jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id,
                       'parent_message_id', new.parent_message_id),
    case when tg_op = 'INSERT' then 'message.created'
         when new.deleted_at is not null then 'message.deleted'
         else 'message.updated' end,
    'channel:' || new.conversation_id::text,
    true
  );
  return null;
end;
$$;

create or replace function public.list_channel_messages(
  p_conversation_id uuid, p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 31
)
returns setof public.messages language sql stable security invoker set search_path = ''
as $$
  select m.* from public.messages m
  where m.conversation_id = p_conversation_id and m.parent_message_id is null
    and ((p_before_created_at is null and p_before_id is null)
      or (p_before_created_at is not null and p_before_id is not null
        and (m.created_at, m.id) < (p_before_created_at, p_before_id)))
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 31), 51));
$$;

create function public.list_thread_replies(
  p_conversation_id uuid, p_root_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 31
)
returns setof public.messages language sql stable security invoker set search_path = ''
as $$
  select m.* from public.messages m
  where m.conversation_id = p_conversation_id and m.parent_message_id = p_root_id
    and exists (select 1 from public.messages root
                where root.id = p_root_id and root.conversation_id = p_conversation_id
                  and root.parent_message_id is null)
    and ((p_before_created_at is null and p_before_id is null)
      or (p_before_created_at is not null and p_before_id is not null
        and (m.created_at, m.id) < (p_before_created_at, p_before_id)))
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 31), 51));
$$;

create function public.list_thread_summaries(p_conversation_id uuid, p_root_ids uuid[])
returns table(root_id uuid, reply_count bigint, latest_reply_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select m.parent_message_id, count(*), max(m.created_at)
  from public.messages m
  join public.messages root on root.id = m.parent_message_id
    and root.conversation_id = p_conversation_id and root.parent_message_id is null
  where m.conversation_id = p_conversation_id
    and m.parent_message_id = any(coalesce(p_root_ids, '{}'::uuid[]))
  group by m.parent_message_id;
$$;

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🔥', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_by_user on public.message_reactions(user_id, message_id);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from public, anon, authenticated;
grant select on public.message_reactions to authenticated;
grant insert (message_id, emoji) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;

create policy "Read visible reactions" on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m
  where m.id = message_id and m.deleted_at is null
    and nova_private.can_read_conversation(m.conversation_id)));
create policy "React as self to visible message" on public.message_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m
  where m.id = message_id and m.deleted_at is null
    and nova_private.can_read_conversation(m.conversation_id)));
create policy "Remove own visible reaction" on public.message_reactions for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.messages m
  where m.id = message_id and nova_private.can_read_conversation(m.conversation_id)));

create function nova_private.sync_reaction_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_message_id uuid;
declare v_conversation_id uuid;
begin
  if tg_op = 'DELETE' then v_message_id := old.message_id;
  else v_message_id := new.message_id; end if;
  select conversation_id into v_conversation_id from public.messages where id = v_message_id;
  if v_conversation_id is not null then
    perform realtime.send(
      jsonb_build_object('message_id', v_message_id, 'conversation_id', v_conversation_id),
      'reaction.changed', 'channel:' || v_conversation_id::text, true
    );
  end if;
  return null;
end;
$$;
create trigger sync_reaction_change after insert or delete on public.message_reactions
for each row execute function nova_private.sync_reaction_change();
revoke execute on function nova_private.sync_reaction_change() from public, anon, authenticated;

create function nova_private.clear_deleted_reactions()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    delete from public.message_reactions where message_id = new.id;
  end if;
  return null;
end;
$$;
create trigger clear_deleted_reactions after update of deleted_at on public.messages
for each row execute function nova_private.clear_deleted_reactions();
revoke execute on function nova_private.clear_deleted_reactions() from public, anon, authenticated;

revoke execute on function
  public.list_thread_replies(uuid, uuid, timestamptz, uuid, integer),
  public.list_thread_summaries(uuid, uuid[])
from public, anon, authenticated;
grant execute on function
  public.list_thread_replies(uuid, uuid, timestamptz, uuid, integer),
  public.list_thread_summaries(uuid, uuid[])
to authenticated;
