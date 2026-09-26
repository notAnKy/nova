-- Canonical message bodies contain @[user-uuid] tokens. This private relation
-- records the distinct validated recipients for later in-app notifications.
create table public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (message_id, user_id)
);
create index message_mentions_by_user on public.message_mentions(user_id, message_id);
alter table public.message_mentions enable row level security;
revoke all on public.message_mentions from public, anon, authenticated;

create function nova_private.sync_message_mentions()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_match text[];
  v_target uuid;
  v_kind text;
  v_workspace_id uuid;
  v_count integer := 0;
begin
  delete from public.message_mentions where message_id = new.id;
  if new.deleted_at is not null then return null; end if;

  select kind, workspace_id into v_kind, v_workspace_id
    from public.conversations where id = new.conversation_id;
  if v_kind is null then raise exception 'conversation_not_found'; end if;

  for v_match in
    select regexp_matches(new.body,
      '@\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]', 'g')
  loop
    v_count := v_count + 1;
    if v_count > 30 then raise exception 'too_many_mentions'; end if;
    v_target := v_match[1]::uuid;
    if v_kind = 'public_channel' then
      if not exists (select 1 from public.workspace_members
                     where workspace_id = v_workspace_id and user_id = v_target) then
        raise exception 'invalid_mention_recipient';
      end if;
    elsif not exists (select 1 from public.conversation_members cm
                      join public.workspace_members wm
                        on wm.workspace_id = cm.workspace_id and wm.user_id = cm.user_id
                      where cm.conversation_id = new.conversation_id and cm.user_id = v_target) then
      raise exception 'invalid_mention_recipient';
    end if;
    insert into public.message_mentions(message_id, user_id)
      values (new.id, v_target) on conflict do nothing;
  end loop;
  return null;
end;
$$;
create trigger sync_message_mentions after insert or update of body, deleted_at on public.messages
for each row execute function nova_private.sync_message_mentions();
revoke execute on function nova_private.sync_message_mentions() from public, anon, authenticated;
