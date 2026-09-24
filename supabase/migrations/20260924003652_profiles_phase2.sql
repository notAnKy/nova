-- Phase 2: only public profile information. Auth identities remain in auth.users.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  status_text text not null default '' check (char_length(status_text) <= 160),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://avatars\.githubusercontent\.com/')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles are visible to signed-in members only; no email or private Auth data is exposed.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, display_name, status_text, avatar_url) on public.profiles to authenticated;
grant update (display_name, status_text) on public.profiles to authenticated;

create policy "Members can read profiles"
on public.profiles for select to authenticated
using ((select auth.uid()) is not null);

create policy "Members can create their own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Members can update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();
