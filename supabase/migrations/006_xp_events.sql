-- Timestamped XP ledger. profiles.xp stays the canonical lifetime total; this
-- table records each gain so period (daily/weekly) XP is summable by time.
-- Champion reads go through the service-role admin client (see champions.ts),
-- but RLS mirrors the sessions/assignments policy style for consistency.
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  source text not null,                 -- 'session' | 'daily' | 'daily_streak'
  created_at timestamptz not null default now()
);

create index xp_events_rep_time on public.xp_events (rep_id, created_at);

alter table public.xp_events enable row level security;

-- A rep may insert only their own events (client-side, like sessions).
create policy "own xp_events insert" on public.xp_events
  for insert with check (rep_id = auth.uid());

-- Same-company members may read each other's events (mirrors sessions reads).
create policy "company xp_events read" on public.xp_events
  for select using (
    rep_id in (
      select id from public.profiles
      where company_id in (
        select company_id from public.profiles where id = auth.uid()
      )
    )
  );
