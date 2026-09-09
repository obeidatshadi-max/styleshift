-- Funnel instrumentation for the 5 AI-voice-partner modes (objection,
-- opening, question, FAB, closing). Fire-and-forget, best-effort — a failed
-- insert never blocks the rep's session, same tolerance as session-result
-- saves. This is the data source for manager-facing voice analytics.
create table public.voice_events (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('objection', 'opening', 'question', 'fab', 'closing')),
  stage text not null check (stage in (
    'recording_start', 'mic_denied', 'not_configured', 'rate_limited',
    'api_error', 'bad_response', 'network_error', 'tts_failed',
    'turn_complete', 'session_complete'
  )),
  latency_ms integer,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index voice_events_rep_time on public.voice_events (rep_id, created_at);
create index voice_events_mode_stage on public.voice_events (mode, stage);

alter table public.voice_events enable row level security;

create policy "own voice events read" on public.voice_events for select using (rep_id = auth.uid());
create policy "own voice events insert" on public.voice_events for insert with check (rep_id = auth.uid());

create policy "manager voice events read" on public.voice_events for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
