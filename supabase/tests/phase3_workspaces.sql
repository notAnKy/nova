-- Run as a privileged SQL editor session. All fixture data is rolled back.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3-a@example.invalid', '', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3-b@example.invalid', '', now()),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3-c@example.invalid', '', now()),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3-d@example.invalid', '', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select set_config('p3.workspace_a', public.create_workspace('Test workspace A', 'phase3-test-a')->>'id', true);
select set_config('p3.member_invite', public.create_workspace_invitation(current_setting('p3.workspace_a')::uuid, 'member', 24, 1)->>'token', true);

do $$ begin
  if (select count(*) from public.workspaces where id = current_setting('p3.workspace_a')::uuid) <> 1 then raise exception 'owner cannot read workspace'; end if;
  if (select role from public.workspace_members where workspace_id = current_setting('p3.workspace_a')::uuid) <> 'owner' then raise exception 'creator is not owner'; end if;
  if public.list_workspace_invitations(current_setting('p3.workspace_a')::uuid)::text like '%token_hash%' then raise exception 'invite hash leaked'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
do $$ begin
  if exists (select 1 from public.workspaces where id = current_setting('p3.workspace_a')::uuid) then raise exception 'outsider can read workspace'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = current_setting('p3.workspace_a')::uuid) then raise exception 'outsider can read roster'; end if;
  if public.preview_workspace_invitation(current_setting('p3.member_invite'))->>'status' <> 'active' then raise exception 'valid invitation preview failed'; end if;
end $$;
do $$ declare denied boolean := false; begin
  begin
    insert into public.workspace_members (workspace_id, user_id, role)
      values (current_setting('p3.workspace_a')::uuid, auth.uid(), 'owner');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'direct membership insert succeeded'; end if;
end $$;
select public.accept_workspace_invitation(current_setting('p3.member_invite'));
do $$ declare denied boolean := false; begin
  if (select role from public.workspace_members where workspace_id = current_setting('p3.workspace_a')::uuid and user_id = auth.uid()) <> 'member' then raise exception 'invite did not add member'; end if;
  if (select count(*) from public.workspaces where id = current_setting('p3.workspace_a')::uuid) <> 1 then raise exception 'member cannot read workspace'; end if;
  begin
    perform public.change_workspace_member_role(current_setting('p3.workspace_a')::uuid, auth.uid(), 'admin');
  exception when others then
    if sqlerrm = 'permission_denied' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'member self promotion succeeded'; end if;
end $$;
select public.accept_workspace_invitation(current_setting('p3.member_invite'));
do $$ begin
  if (select uses from public.workspace_invitations where workspace_id = current_setting('p3.workspace_a')::uuid) is not null then raise exception 'invitation table readable'; end if;
exception when insufficient_privilege then null; end $$;

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', true);
do $$ declare denied boolean := false; begin
  begin perform public.accept_workspace_invitation(current_setting('p3.member_invite'));
  exception when others then if sqlerrm = 'invite_exhausted' then denied := true; else raise; end if; end;
  if not denied then raise exception 'max use invite accepted'; end if;
end $$;
select set_config('p3.workspace_c', public.create_workspace('Test workspace C', 'phase3-test-c')->>'id', true);
do $$ begin
  if exists (select 1 from public.workspaces where id = current_setting('p3.workspace_a')::uuid) then raise exception 'cross workspace read allowed'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select set_config('p3.revoked_payload', public.create_workspace_invitation(current_setting('p3.workspace_a')::uuid, 'member', 24, 1)::text, true);
select public.revoke_workspace_invitation((current_setting('p3.revoked_payload')::jsonb->>'id')::uuid);
select set_config('p3.expired_invite', public.create_workspace_invitation(current_setting('p3.workspace_a')::uuid, 'member', 24, 1)->>'token', true);
reset role;
update public.workspace_invitations set created_at = now() - interval '3 days', expires_at = now() - interval '2 days'
where token_hash = encode(sha256(convert_to(current_setting('p3.expired_invite'), 'UTF8')), 'hex');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', true);
do $$ declare revoked boolean := false; expired boolean := false; begin
  if public.preview_workspace_invitation(current_setting('p3.revoked_payload')::jsonb->>'token')->>'status' <> 'revoked' then raise exception 'revoked preview failed'; end if;
  if public.preview_workspace_invitation(current_setting('p3.expired_invite'))->>'status' <> 'expired' then raise exception 'expired preview failed'; end if;
  if public.preview_workspace_invitation(repeat('0', 64))->>'status' <> 'invalid' then raise exception 'invalid preview failed'; end if;
  begin perform public.accept_workspace_invitation(current_setting('p3.revoked_payload')::jsonb->>'token');
  exception when others then if sqlerrm = 'invite_revoked' then revoked := true; else raise; end if; end;
  begin perform public.accept_workspace_invitation(current_setting('p3.expired_invite'));
  exception when others then if sqlerrm = 'invite_expired' then expired := true; else raise; end if; end;
  if not revoked or not expired then raise exception 'revoked or expired invite accepted'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select set_config('p3.admin_invite', public.create_workspace_invitation(current_setting('p3.workspace_a')::uuid, 'admin', 24, 1)->>'token', true);
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', true);
select public.accept_workspace_invitation(current_setting('p3.admin_invite'));
do $$ declare denied boolean := false; begin
  begin perform public.remove_workspace_member(current_setting('p3.workspace_a')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  exception when others then if sqlerrm = 'owner_transfer_required' then denied := true; else raise; end if; end;
  if not denied then raise exception 'admin removed owner'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
select public.remove_workspace_member(current_setting('p3.workspace_a')::uuid, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3');
do $$ declare denied boolean := false; begin
  begin perform public.leave_workspace(current_setting('p3.workspace_a')::uuid);
  exception when others then if sqlerrm = 'owner_transfer_required' then denied := true; else raise; end if; end;
  if not denied then raise exception 'owner left workspace'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', true);
do $$ begin
  if exists (select 1 from public.workspaces where id = current_setting('p3.workspace_a')::uuid) then raise exception 'removed member can read workspace'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = current_setting('p3.workspace_a')::uuid) then raise exception 'removed member can read roster'; end if;
  if not exists (select 1 from public.workspaces where id = current_setting('p3.workspace_c')::uuid) then raise exception 'own workspace disappeared'; end if;
end $$;
do $$ declare denied boolean := false; begin
  begin perform public.accept_workspace_invitation(current_setting('p3.admin_invite'));
  exception when others then if sqlerrm = 'invite_revoked' then denied := true; else raise; end if; end;
  if not denied then raise exception 'removed member reused old invite'; end if;
end $$;

reset role;
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('workspaces', 'workspace_members', 'workspace_invitations') and not c.relrowsecurity)
    then raise exception 'workspace RLS disabled'; end if;
  if has_table_privilege('anon', 'public.workspaces', 'SELECT')
    or has_table_privilege('anon', 'public.workspace_members', 'SELECT')
    or has_table_privilege('anon', 'public.workspace_invitations', 'SELECT')
    or has_table_privilege('authenticated', 'public.workspace_invitations', 'SELECT')
    or has_table_privilege('authenticated', 'public.workspace_members', 'INSERT')
    or has_table_privilege('authenticated', 'public.workspace_members', 'UPDATE')
    then raise exception 'workspace grants too broad'; end if;
  if has_function_privilege('anon', 'public.create_workspace(text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.accept_workspace_invitation(text)', 'EXECUTE')
    then raise exception 'anonymous RPC execution allowed'; end if;
end $$;
set local role anon;
do $$ declare denied boolean := false; begin
  begin perform 1 from public.workspaces limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anonymous workspace read succeeded'; end if;
  denied := false;
  begin perform public.create_workspace('Anonymous', 'phase3-anonymous');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anonymous workspace creation succeeded'; end if;
end $$;
reset role;
rollback;
