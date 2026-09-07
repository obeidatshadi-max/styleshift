-- Voice-partner opening-statement results: one row per attempt (this mode
-- is single-turn, so unlike voice_partner_sessions there is no outcome or
-- turn_count — only which of the 4 rubric criteria the statement hit).
-- Rows are self-reported by the client (no server-side session state to
-- validate against) — a future manager-facing view must treat them as
-- practice self-reports, not audited results.
create table public.voice_partner_opening_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.voice_partner_opening_sessions enable row level security;

create policy "own voice partner opening sessions read" on public.voice_partner_opening_sessions for select using (rep_id = auth.uid());

create policy "own voice partner opening sessions insert" on public.voice_partner_opening_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner opening sessions read" on public.voice_partner_opening_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
