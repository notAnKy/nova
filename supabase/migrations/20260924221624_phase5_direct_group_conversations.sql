-- Phase 5 extends the existing conversation/message model; DMs use the same
-- message, read-cursor, and private Broadcast access paths as channels.
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check
  check (kind in ('public_channel', 'private_channel', 'direct', 'group_direct'));
alter table public.conversations
  add column direct_user_low uuid,
  add column direct_user_high uuid,
  add constraint conversations_direct_pair_shape check (
    (kind = 'direct' and direct_user_low is not null and direct_user_high is not null
      and direct_user_low < direct_user_high)
    or (kind <> 'direct' and direct_user_low is null and direct_user_high is null)
  ),
  add constraint conversations_direct_low_member foreign key (workspace_id, direct_user_low)
    references public.workspace_members(workspace_id, user_id) on delete cascade,
  add constraint conversations_direct_high_member foreign key (workspace_id, direct_user_high)
    references public.workspace_members(workspace_id, user_id) on delete cascade;
create unique index conversations_direct_pair_unique
  on public.conversations(workspace_id, direct_user_low, direct_user_high)
  where kind = 'direct';
create index conversations_dm_recent
  on public.conversations(workspace_id, last_message_at desc, created_at desc, id desc)
  where kind in ('direct', 'group_direct');

-- Channel membership still protects its last member. DM membership is fixed
-- after creation; losing a participant removes a DM that no longer meets its
-- minimum size rather than leaving an orphaned private conversation.
create or replace function nova_private.keep_private_channel_member()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select kind from public.conversations where id = old.conversation_id) = 'private_channel'
     and (select count(*) from public.conversation_members
          where conversation_id = old.conversation_id) <= 1 then
    raise exception 'last_private_channel_member';
  end if;
  return old;
end;
$$;

create function nova_private.enforce_direct_pair_member()
returns trigger language plpgsql set search_path = ''
as $$
declare v_conversation public.conversations%rowtype;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if v_conversation.kind = 'direct' and new.user_id not in
      (v_conversation.direct_user_low, v_conversation.direct_user_high) then
    raise exception 'direct_pair_member_only';
  end if;
  return new;
end;
$$;
create trigger enforce_direct_pair_member before insert or update on public.conversation_members
for each row execute function nova_private.enforce_direct_pair_member();

create function nova_private.validate_dm_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_count integer;
  v_pair_count integer;
  v_creator_count integer;
begin
  select * into v_conversation from public.conversations where id = new.id;
  if not found or v_conversation.kind not in ('direct', 'group_direct') then return null; end if;
  select count(*),
    count(*) filter (where user_id in (v_conversation.direct_user_low, v_conversation.direct_user_high)),
    count(*) filter (where user_id = v_conversation.created_by)
  into v_count, v_pair_count, v_creator_count
  from public.conversation_members where conversation_id = new.id;
  if (v_conversation.kind = 'direct' and (v_count <> 2 or v_pair_count <> 2))
     or (v_conversation.kind = 'group_direct' and (v_count < 3 or v_creator_count <> 1)) then
    raise exception 'invalid_dm_membership';
  end if;
  return null;
end;
$$;
create constraint trigger validate_dm_membership after insert or update on public.conversations
deferrable initially deferred for each row execute function nova_private.validate_dm_membership();

create function nova_private.prune_incomplete_dm()
returns trigger language plpgsql set search_path = ''
as $$
declare v_kind text;
declare v_creator uuid;
declare v_count integer;
begin
  select kind, created_by into v_kind, v_creator from public.conversations where id = old.conversation_id;
  if v_kind not in ('direct', 'group_direct') then return null; end if;
  select count(*) into v_count from public.conversation_members
    where conversation_id = old.conversation_id;
  if (v_kind = 'direct' and v_count < 2)
     or (v_kind = 'group_direct' and (v_count < 3 or old.user_id = v_creator)) then
    delete from public.conversations where id = old.conversation_id;
  end if;
  return null;
end;
$$;
create trigger prune_incomplete_dm after delete on public.conversation_members
for each row execute function nova_private.prune_incomplete_dm();

create function nova_private.create_or_get_direct(p_workspace_id uuid, p_other_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_self uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_member uuid;
  v_id uuid := gen_random_uuid();
  v_created boolean := false;
begin
  if v_self is null then raise exception 'authentication_required'; end if;
  if p_other_user_id is null or p_other_user_id = v_self then raise exception 'invalid_direct_recipient'; end if;
  v_low := least(v_self, p_other_user_id);
  v_high := greatest(v_self, p_other_user_id);
  for v_member in select unnest(array[v_low, v_high]) order by 1 loop
    perform 1 from public.workspace_members
      where workspace_id = p_workspace_id and user_id = v_member for key share;
    if not found then
      if v_member = v_self then raise exception 'workspace_not_found'; end if;
      raise exception 'member_not_found';
    end if;
  end loop;
  insert into public.conversations
    (id, workspace_id, kind, name, slug, topic, created_by, direct_user_low, direct_user_high)
    values (v_id, p_workspace_id, 'direct', 'Direct message', 'dm-' || v_id::text, '',
      v_self, v_low, v_high)
    on conflict (workspace_id, direct_user_low, direct_user_high) where kind = 'direct'
      do nothing
    returning true into v_created;
  if v_created then
    insert into public.conversation_members(workspace_id, conversation_id, user_id)
      values (p_workspace_id, v_id, v_low), (p_workspace_id, v_id, v_high);
  else
    select id into v_id from public.conversations
      where workspace_id = p_workspace_id and kind = 'direct'
        and direct_user_low = v_low and direct_user_high = v_high;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

create function nova_private.create_group_direct(p_workspace_id uuid, p_other_user_ids uuid[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_self uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_other uuid;
begin
  if v_self is null then raise exception 'authentication_required'; end if;
  if p_other_user_ids is null or cardinality(p_other_user_ids) not between 2 and 11
     or array_position(p_other_user_ids, null) is not null
     or array_position(p_other_user_ids, v_self) is not null
     or (select count(distinct u) from unnest(p_other_user_ids) as u) <> cardinality(p_other_user_ids) then
    raise exception 'invalid_group_recipients';
  end if;
  for v_other in select unnest(array_append(p_other_user_ids, v_self)) order by 1 loop
    perform 1 from public.workspace_members
      where workspace_id = p_workspace_id and user_id = v_other for key share;
    if not found then
      if v_other = v_self then raise exception 'workspace_not_found'; end if;
      raise exception 'member_not_found';
    end if;
  end loop;
  insert into public.conversations(id, workspace_id, kind, name, slug, topic, created_by)
    values (v_id, p_workspace_id, 'group_direct', 'Group message', 'group-' || v_id::text, '', v_self);
  insert into public.conversation_members(workspace_id, conversation_id, user_id)
    select p_workspace_id, v_id, user_id
    from unnest(array_append(p_other_user_ids, v_self)) as user_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create function public.create_or_get_direct(p_workspace_id uuid, p_other_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.create_or_get_direct(p_workspace_id, p_other_user_id); $$;
create function public.create_group_direct(p_workspace_id uuid, p_other_user_ids uuid[])
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.create_group_direct(p_workspace_id, p_other_user_ids); $$;

revoke execute on function
  nova_private.enforce_direct_pair_member(), nova_private.validate_dm_membership(), nova_private.prune_incomplete_dm(),
  nova_private.create_or_get_direct(uuid, uuid), nova_private.create_group_direct(uuid, uuid[]),
  public.create_or_get_direct(uuid, uuid), public.create_group_direct(uuid, uuid[])
from public, anon, authenticated;
grant execute on function
  nova_private.create_or_get_direct(uuid, uuid), nova_private.create_group_direct(uuid, uuid[]),
  public.create_or_get_direct(uuid, uuid), public.create_group_direct(uuid, uuid[])
to authenticated;
