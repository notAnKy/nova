-- Workspace-member removal can cascade direct conversations by their high UUID.
create index conversations_direct_high_member_idx
  on public.conversations(workspace_id, direct_user_high)
  where direct_user_high is not null;
