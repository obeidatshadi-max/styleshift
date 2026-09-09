-- Peer groups: any rep can create a shared-leaderboard-only group and invite
-- others via a link, independent of the company/manager hierarchy. A rep
-- belongs to at most one group at a time (mirrors profiles.company_id).
--
-- invite_code uses pgcrypto's CSPRNG at 128 bits (unlike companies.invite_code's
-- md5(random())::text, which draws from Postgres's non-cryptographic RNG at
-- only 32 bits of keyspace) — brute-forcing a group code shouldn't be
-- materially easier than guessing a UUID.
create extension if not exists pgcrypto;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Group',
  invite_code text unique not null default encode(gen_random_bytes(16), 'hex'),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column group_id uuid references public.groups(id) on delete set null;

alter table public.groups enable row level security;

-- Reads go through the service-role admin client (group-standings.ts / the
-- invite-code lookup in the join route), same approach as companies/leagues.
-- This policy only covers a member reading their own group row directly.
create policy "own group read" on public.groups for select using (
  owner_id = auth.uid()
  or id in (select group_id from public.profiles where id = auth.uid())
);
