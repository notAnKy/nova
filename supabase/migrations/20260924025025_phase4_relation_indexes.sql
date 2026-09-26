-- Cover the composite foreign keys used by membership removal and channel cleanup.
create index conversation_members_workspace_channel
  on public.conversation_members(workspace_id, conversation_id);
create index conversation_members_workspace_user
  on public.conversation_members(workspace_id, user_id);
create index conversation_reads_workspace_channel
  on public.conversation_reads(workspace_id, conversation_id);
create index conversation_reads_workspace_user
  on public.conversation_reads(workspace_id, user_id);

-- These single-user indexes do not serve a Phase 4 query. Keep writes lean.
drop index public.conversation_members_by_user;
drop index public.conversation_reads_by_user;
drop index public.messages_by_author;
