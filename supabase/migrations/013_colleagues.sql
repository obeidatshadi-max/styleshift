-- A rep's private roster of practice colleagues — deliberately minimal
-- (name only), unlike `doctors` which carries a full prep profile. A
-- colleague is a practice partner's identity, not a prep target.
create table public.colleagues (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.colleagues enable row level security;
create policy "own colleagues read" on public.colleagues for select using (rep_id = auth.uid());
create policy "own colleagues insert" on public.colleagues for insert with check (rep_id = auth.uid());
create policy "own colleagues delete" on public.colleagues for delete using (rep_id = auth.uid());

-- Roleplay sessions can now optionally be scoped to a named colleague,
-- independent of (and alongside) the existing optional doctor scope.
alter table public.roleplay_sessions
  add column colleague_id uuid references public.colleagues(id) on delete set null;

drop policy "own roleplay sessions insert" on public.roleplay_sessions;
create policy "own roleplay sessions insert" on public.roleplay_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
  and (colleague_id is null or colleague_id in (select id from public.colleagues where rep_id = auth.uid()))
);
