-- The parent lookup needs only SELECT visibility; the composite FK holds integrity.
-- FOR KEY SHARE also invokes UPDATE RLS and hides another author's readable root.
create or replace function nova_private.validate_thread_parent()
returns trigger language plpgsql set search_path = ''
as $$
declare v_parent uuid;
begin
  if new.parent_message_id is null then return new; end if;
  select parent_message_id into v_parent from public.messages
    where conversation_id = new.conversation_id and id = new.parent_message_id;
  if not found then raise exception 'thread_root_not_found'; end if;
  if v_parent is not null then raise exception 'nested_thread_not_allowed'; end if;
  return new;
end;
$$;
