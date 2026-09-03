-- Roleplay verbal-mirror sessions: a rep and a practice colleague roleplay a
-- visit out loud, the audio is diarized (AssemblyAI, triggered client-side),
-- and only the derived metrics are persisted here — never the audio, never
-- the full transcript, never the practice partner's spoken words.
create table public.roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  duration_sec integer not null,
  talk_ratio numeric not null check (talk_ratio between 0 and 1),
  rapid_turn_switches integer not null default 0,
  question_ratio numeric not null check (question_ratio between 0 and 1),
  rep_style text check (rep_style = any (array['driver','expressive','amiable','analytical'])),
  rep_confidence integer,
  rep_metrics jsonb,
  created_at timestamptz not null default now()
);

alter table public.roleplay_sessions enable row level security;

create policy "own roleplay sessions read" on public.roleplay_sessions for select using (rep_id = auth.uid());
create policy "own roleplay sessions insert" on public.roleplay_sessions for insert with check (rep_id = auth.uid());

create policy "manager roleplay sessions read" on public.roleplay_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
