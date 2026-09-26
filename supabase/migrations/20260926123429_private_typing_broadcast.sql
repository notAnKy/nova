-- Client-originated typing hints use the existing private conversation topic.
-- The SELECT policy already limits receivers to current conversation readers.
create policy "Conversation members send typing hints"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and nova_private.can_read_realtime_topic((select realtime.topic()))
);
