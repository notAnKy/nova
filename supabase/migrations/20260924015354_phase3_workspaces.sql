-- Phase 3: workspace identity, membership and invitation links only.
-- Privileged operations live in a schema that is not exposed by the Data API.
create schema if not exists nova_private;
revoke all on schema nova_private from public, anon, authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' and slug !~ '--'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  role text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create unique index workspace_one_owner on public.workspace_members (workspace_id) where role = 'owner';
create index workspace_members_by_user on public.workspace_members (user_id, workspace_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  intended_role text not null check (intended_role in ('admin', 'member')),
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 25),
  uses integer not null default 0 check (uses >= 0 and uses <= max_uses),
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index workspace_invitations_by_workspace on public.workspace_invitations (workspace_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

-- No direct Data API writes. Invitation hashes have no table grants at all.
revoke all on public.workspaces, public.workspace_members, public.workspace_invitations from public, anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;

create function nova_private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid())
  );
$$;

create policy "Members read their workspaces" on public.workspaces
for select to authenticated using (nova_private.is_workspace_member(id));

create policy "Members read their workspace roster" on public.workspace_members
for select to authenticated using (nova_private.is_workspace_member(workspace_id));

-- workspace_invitations intentionally has no table policy. Narrow RPCs return
-- metadata without token_hash, or consume a supplied raw token by its hash.

create function nova_private.member_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.role from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid());
$$;

create function nova_private.touch_workspace_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_updated_at before update on public.workspaces
for each row execute function nova_private.touch_workspace_updated_at();

-- There is exactly one owner in Phase 3. Ownership transfer and deletion are
-- deliberately absent. This protects the invariant even outside the RPCs.
create function nova_private.protect_workspace_owner()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then raise exception 'owner_transfer_required'; end if;
    return old;
  end if;
  if old.role = 'owner' and (
    new.role is distinct from 'owner'
    or new.workspace_id is distinct from old.workspace_id
    or new.user_id is distinct from old.user_id
  ) then raise exception 'owner_transfer_required'; end if;
  return new;
end;
$$;

create trigger protect_workspace_owner before update or delete on public.workspace_members
for each row execute function nova_private.protect_workspace_owner();

create function nova_private.create_workspace(p_name text, p_slug text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_name is null or char_length(v_name) not between 2 and 80 then raise exception 'invalid_workspace_name'; end if;
  if p_slug is null or p_slug <> lower(btrim(p_slug))
     or p_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' or p_slug ~ '--' then
    raise exception 'invalid_workspace_slug';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (v_name, p_slug, v_user) returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_id, v_user, 'owner');
  return jsonb_build_object('id', v_id, 'slug', p_slug);
end;
$$;

create function nova_private.update_workspace_settings(p_workspace_id uuid, p_name text, p_slug text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if coalesce(nova_private.member_role(p_workspace_id), '') not in ('owner', 'admin') then raise exception 'permission_denied'; end if;
  if v_name is null or char_length(v_name) not between 2 and 80 then raise exception 'invalid_workspace_name'; end if;
  if p_slug is null or p_slug <> lower(btrim(p_slug))
     or p_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' or p_slug ~ '--' then
    raise exception 'invalid_workspace_slug';
  end if;
  update public.workspaces set name = v_name, slug = p_slug where id = p_workspace_id;
  return jsonb_build_object('id', p_workspace_id, 'slug', p_slug);
end;
$$;

create function nova_private.change_workspace_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if nova_private.member_role(p_workspace_id) is distinct from 'owner' then raise exception 'permission_denied'; end if;
  if p_role is null or p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;
  select role into v_target_role from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id for update;
  if v_target_role is null then raise exception 'member_not_found'; end if;
  if v_target_role = 'owner' then raise exception 'owner_transfer_required'; end if;
  update public.workspace_members set role = p_role
    where workspace_id = p_workspace_id and user_id = p_user_id;
  return jsonb_build_object('user_id', p_user_id, 'role', p_role);
end;
$$;

create function nova_private.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  v_actor_role := nova_private.member_role(p_workspace_id);
  if coalesce(v_actor_role, '') not in ('owner', 'admin') then raise exception 'permission_denied'; end if;
  if p_user_id = auth.uid() then raise exception 'use_leave_workspace'; end if;
  select role into v_target_role from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id for update;
  if v_target_role is null then raise exception 'member_not_found'; end if;
  if v_target_role = 'owner' then raise exception 'owner_transfer_required'; end if;
  if v_actor_role = 'admin' and v_target_role <> 'member' then raise exception 'permission_denied'; end if;

  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  -- Invalidate every older invite so the removed user cannot reuse a link they kept.
  update public.workspace_invitations set revoked_at = now()
    where workspace_id = p_workspace_id and revoked_at is null;
  return jsonb_build_object('user_id', p_user_id);
end;
$$;

create function nova_private.leave_workspace(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  v_role := nova_private.member_role(p_workspace_id);
  if v_role is null then raise exception 'permission_denied'; end if;
  if v_role = 'owner' then raise exception 'owner_transfer_required'; end if;
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = auth.uid();
  update public.workspace_invitations set revoked_at = now()
    where workspace_id = p_workspace_id and created_by = auth.uid() and revoked_at is null;
  return jsonb_build_object('left', true);
end;
$$;

create function nova_private.create_workspace_invitation(
  p_workspace_id uuid, p_role text, p_expiry_hours integer, p_max_uses integer
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_role text;
  v_token text;
  v_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  v_actor_role := nova_private.member_role(p_workspace_id);
  if coalesce(v_actor_role, '') not in ('owner', 'admin') then raise exception 'permission_denied'; end if;
  if p_role is null or p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;
  if p_role = 'admin' and v_actor_role <> 'owner' then raise exception 'permission_denied'; end if;
  if p_expiry_hours is null or p_expiry_hours not in (24, 168, 720) then raise exception 'invalid_expiry'; end if;
  if p_max_uses is null or p_max_uses not between 1 and 25 then raise exception 'invalid_max_uses'; end if;

  -- Two UUIDv4 values provide about 244 bits of randomness. Only SHA-256 is stored.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at := now() + make_interval(hours => p_expiry_hours);
  insert into public.workspace_invitations
    (workspace_id, token_hash, intended_role, expires_at, max_uses, created_by)
  values
    (p_workspace_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_role, v_expires_at, p_max_uses, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires_at);
end;
$$;

create function nova_private.list_workspace_invitations(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if coalesce(nova_private.member_role(p_workspace_id), '') not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'intended_role', i.intended_role, 'expires_at', i.expires_at,
    'max_uses', i.max_uses, 'uses', i.uses, 'revoked_at', i.revoked_at,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb) into v_items
  from (select * from public.workspace_invitations
        where workspace_id = p_workspace_id order by created_at desc limit 50) i;
  return v_items;
end;
$$;

create function nova_private.revoke_workspace_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select workspace_id into v_workspace_id from public.workspace_invitations where id = p_invitation_id;
  if v_workspace_id is null then raise exception 'invitation_not_found'; end if;
  perform 1 from public.workspaces where id = v_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if coalesce(nova_private.member_role(v_workspace_id), '') not in ('owner', 'admin') then
    raise exception 'permission_denied';
  end if;
  update public.workspace_invitations set revoked_at = coalesce(revoked_at, now())
    where id = p_invitation_id;
  return jsonb_build_object('revoked', true);
end;
$$;

create function nova_private.preview_workspace_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inv public.workspace_invitations%rowtype;
  v_name text;
  v_slug text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select i.* into v_inv from public.workspace_invitations i
    where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_inv.id is null then return jsonb_build_object('status', 'invalid'); end if;
  select w.name, w.slug into v_name, v_slug from public.workspaces w where w.id = v_inv.workspace_id;
  if nova_private.member_role(v_inv.workspace_id) is not null then
    v_status := 'already_member';
  elsif v_inv.revoked_at is not null then
    v_status := 'revoked';
  elsif v_inv.expires_at <= now() then
    v_status := 'expired';
  elsif v_inv.uses >= v_inv.max_uses then
    v_status := 'exhausted';
  else
    v_status := 'active';
  end if;
  return jsonb_build_object(
    'status', v_status, 'workspace_name', v_name, 'workspace_slug', v_slug,
    'intended_role', v_inv.intended_role, 'expires_at', v_inv.expires_at,
    'uses', v_inv.uses, 'max_uses', v_inv.max_uses
  );
end;
$$;

create function nova_private.accept_workspace_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.workspace_invitations%rowtype;
  v_workspace_id uuid;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invite_invalid'; end if;
  select workspace_id into v_workspace_id from public.workspace_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_workspace_id is null then raise exception 'invite_invalid'; end if;

  -- All membership/removal/invite mutations lock the workspace first. This
  -- serializes revocation and acceptance, then the invite row protects uses.
  select slug into v_slug from public.workspaces where id = v_workspace_id for update;
  if v_slug is null then raise exception 'invite_invalid'; end if;
  select * into v_inv from public.workspace_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if v_inv.id is null then raise exception 'invite_invalid'; end if;
  if nova_private.member_role(v_workspace_id) is not null then
    return jsonb_build_object('slug', v_slug, 'already_member', true);
  end if;
  if v_inv.revoked_at is not null then raise exception 'invite_revoked'; end if;
  if v_inv.expires_at <= now() then raise exception 'invite_expired'; end if;
  if v_inv.uses >= v_inv.max_uses then raise exception 'invite_exhausted'; end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), v_inv.intended_role);
  update public.workspace_invitations set uses = uses + 1 where id = v_inv.id;
  return jsonb_build_object('slug', v_slug, 'already_member', false);
end;
$$;

-- The public Data API sees only invoker wrappers. Each private function checks
-- auth.uid() and current membership itself; none accepts a client-supplied role
-- or user ID as the actor's authorization source.
create function public.create_workspace(p_name text, p_slug text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.create_workspace(p_name, p_slug); $$;

create function public.update_workspace_settings(p_workspace_id uuid, p_name text, p_slug text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.update_workspace_settings(p_workspace_id, p_name, p_slug); $$;

create function public.change_workspace_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.change_workspace_member_role(p_workspace_id, p_user_id, p_role); $$;

create function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.remove_workspace_member(p_workspace_id, p_user_id); $$;

create function public.leave_workspace(p_workspace_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.leave_workspace(p_workspace_id); $$;

create function public.create_workspace_invitation(
  p_workspace_id uuid, p_role text, p_expiry_hours integer, p_max_uses integer
)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.create_workspace_invitation(p_workspace_id, p_role, p_expiry_hours, p_max_uses); $$;

create function public.list_workspace_invitations(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nova_private.list_workspace_invitations(p_workspace_id); $$;

create function public.revoke_workspace_invitation(p_invitation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.revoke_workspace_invitation(p_invitation_id); $$;

create function public.preview_workspace_invitation(p_token text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nova_private.preview_workspace_invitation(p_token); $$;

create function public.accept_workspace_invitation(p_token text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nova_private.accept_workspace_invitation(p_token); $$;

revoke execute on all functions in schema nova_private from public, anon, authenticated;
grant usage on schema nova_private to authenticated;
grant execute on function
  nova_private.is_workspace_member(uuid),
  nova_private.create_workspace(text, text),
  nova_private.update_workspace_settings(uuid, text, text),
  nova_private.change_workspace_member_role(uuid, uuid, text),
  nova_private.remove_workspace_member(uuid, uuid),
  nova_private.leave_workspace(uuid),
  nova_private.create_workspace_invitation(uuid, text, integer, integer),
  nova_private.list_workspace_invitations(uuid),
  nova_private.revoke_workspace_invitation(uuid),
  nova_private.preview_workspace_invitation(text),
  nova_private.accept_workspace_invitation(text)
to authenticated;

revoke all on function
  public.create_workspace(text, text),
  public.update_workspace_settings(uuid, text, text),
  public.change_workspace_member_role(uuid, uuid, text),
  public.remove_workspace_member(uuid, uuid),
  public.leave_workspace(uuid),
  public.create_workspace_invitation(uuid, text, integer, integer),
  public.list_workspace_invitations(uuid),
  public.revoke_workspace_invitation(uuid),
  public.preview_workspace_invitation(text),
  public.accept_workspace_invitation(text)
from public, anon, authenticated;

grant execute on function
  public.create_workspace(text, text),
  public.update_workspace_settings(uuid, text, text),
  public.change_workspace_member_role(uuid, uuid, text),
  public.remove_workspace_member(uuid, uuid),
  public.leave_workspace(uuid),
  public.create_workspace_invitation(uuid, text, integer, integer),
  public.list_workspace_invitations(uuid),
  public.revoke_workspace_invitation(uuid),
  public.preview_workspace_invitation(text),
  public.accept_workspace_invitation(text)
to authenticated;
