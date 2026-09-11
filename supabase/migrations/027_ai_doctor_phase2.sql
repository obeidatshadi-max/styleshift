-- AI Doctor Phase 2: post-session evaluation (evidence extraction,
-- competency scorecard, Critical Moments) — see docs/ai-doctor-phase-1-plan.md's
-- "Deferred / Phase 2" note. Computed lazily on-demand (Deep Analysis, not
-- the live turn-by-turn judge call) from conversation_turns (migration 026).

-- One scorecard per session — re-running analysis upserts this row rather
-- than accumulating history, since it's a derived view of the (immutable)
-- transcript, not an event log. rep_id/doctor_id stored directly (not
-- inferred via a join), same RLS rationale as migration 026.
create table public.session_scorecards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  -- Record<CompetencyDimension, {score, turnRefs, rationale}> — see
  -- src/lib/session-evaluator.ts's CompetencyScores type for the exact shape.
  competencies jsonb not null,
  -- SessionSignals (deterministic ConversationObserver output) — see the
  -- same file's SessionSignals type.
  signals jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_scorecards_rep_idx on public.session_scorecards (rep_id, created_at desc);

alter table public.session_scorecards enable row level security;

create policy "own session scorecards read" on public.session_scorecards for select using (rep_id = auth.uid());
create policy "own session scorecards insert" on public.session_scorecards for insert with check (rep_id = auth.uid());
create policy "own session scorecards update" on public.session_scorecards for update using (rep_id = auth.uid());

create policy "manager session scorecards read" on public.session_scorecards for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);

-- Critical Moments: 0-7 rows per session, each grounded in a real
-- conversation_turns row (see groundEvaluatorResult in session-evaluator.ts
-- — quote/role/turn_created_at are copied from that row server-side, never
-- taken from the model). Re-running analysis deletes and reinserts this
-- session's rows rather than updating in place (simpler than a stable
-- per-moment identity the model doesn't provide).
create table public.session_critical_moments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  turn_index integer not null,
  role text not null check (role = any (array['doctor','rep'])),
  quote text not null,
  -- The referenced conversation_turns row's own created_at, copied
  -- verbatim — never a timestamp invented by the model.
  turn_created_at timestamptz not null,
  observed_behavior text not null,
  missed_opportunity text,
  alternative text,
  created_at timestamptz not null default now()
);

create index session_critical_moments_session_idx on public.session_critical_moments (session_id, turn_index);
create index session_critical_moments_rep_idx on public.session_critical_moments (rep_id, created_at desc);

alter table public.session_critical_moments enable row level security;

create policy "own session critical moments read" on public.session_critical_moments for select using (rep_id = auth.uid());
create policy "own session critical moments insert" on public.session_critical_moments for insert with check (rep_id = auth.uid());
create policy "own session critical moments delete" on public.session_critical_moments for delete using (rep_id = auth.uid());

create policy "manager session critical moments read" on public.session_critical_moments for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
