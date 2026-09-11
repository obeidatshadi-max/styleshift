-- AI Doctor Phase 1: transcript persistence, weighted persona, hidden
-- concerns, scenario context, and difficulty — see docs/ai-doctor-phase-1-plan.md.

-- Turn-by-turn evidence store for the AI voice-partner ("turn" judge loop).
-- Deliberately NOT foreign-keyed to voice_partner_sessions: that table only
-- gets a row once a session resolves (won/escalated), self-reported by the
-- client at the end (see migration 014's comment) — turns need to be
-- recorded live, per exchange, before the outcome is known, and an abandoned
-- session (rep quits mid-conversation) never gets a voice_partner_sessions
-- row at all but its turns are still worth keeping as evidence. `rep_id` is
-- stored directly (not inferred via a join) so RLS does not depend on that
-- row existing.
create table public.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  turn_index integer not null,
  role text not null check (role = any (array['doctor','rep'])),
  text text not null,
  objection_type text check (objection_type = any (
    array['wrong_info','doubt','true_objection','indifference','false_objection']
  )),
  clear_steps_hit text[] not null default '{}',
  -- Physician-state snapshot AFTER this turn. Nothing reads these yet — they
  -- exist now so Pressure Shift (Phase 4) can be built without a second
  -- migration, per the Phase 1 plan's "zero-cost column addition" note.
  trust integer check (trust between 0 and 100),
  skepticism integer check (skepticism between 0 and 100),
  engagement integer check (engagement between 0 and 100),
  time_pressure integer check (time_pressure between 0 and 100),
  created_at timestamptz not null default now()
);

create index conversation_turns_session_idx on public.conversation_turns (session_id, turn_index);
create index conversation_turns_rep_idx on public.conversation_turns (rep_id, created_at desc);

alter table public.conversation_turns enable row level security;

create policy "own conversation turns read" on public.conversation_turns for select using (rep_id = auth.uid());

create policy "own conversation turns insert" on public.conversation_turns for insert with check (rep_id = auth.uid());

create policy "manager conversation turns read" on public.conversation_turns for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);

-- Weighted physician persona (nullable — null means "use the legacy single
-- `style` column", so every existing doctor keeps working unchanged), a
-- private true concern distinct from the spoken `objections[]`, and scenario
-- context fields. All nullable/additive per the Phase 1 plan.
alter table public.doctors
  add column if not exists style_driver numeric check (style_driver is null or (style_driver >= 0 and style_driver <= 1)),
  add column if not exists style_expressive numeric check (style_expressive is null or (style_expressive >= 0 and style_expressive <= 1)),
  add column if not exists style_amiable numeric check (style_amiable is null or (style_amiable >= 0 and style_amiable <= 1)),
  add column if not exists style_analytical numeric check (style_analytical is null or (style_analytical >= 0 and style_analytical <= 1)),
  add column if not exists hidden_concern text,
  add column if not exists product_context text,
  add column if not exists meeting_stage text,
  add column if not exists available_time_min integer check (available_time_min is null or available_time_min > 0);

-- Difficulty chosen at session start; nullable so historical rows (and any
-- client that doesn't send one yet) keep reading fine.
alter table public.voice_partner_sessions
  add column if not exists difficulty text check (difficulty = any (
    array['supportive','realistic','resistant','pressure_test']
  ));
