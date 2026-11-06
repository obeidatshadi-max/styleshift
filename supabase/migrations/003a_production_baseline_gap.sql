-- Production baseline gap: doctors, doctor_visits and daily_challenges.
--
-- These three tables were created in production by hand and never had a migration file, yet other migrations
-- (004, 009, 013-018, 026-028 ...) build on them. This file records them exactly as production has them
-- (read from pg_catalog on 2026-11-06, see docs/security/schema-baseline.md), so a database built from the
-- files alone matches production.
--
-- It is written to be a no-op on production: every statement is "if not exists" or guarded by a catalog check.
-- It is named so that it sorts after 001 (which creates profiles) and before 004 (the first migration that
-- touches these tables). Columns added later by 026, 20261005120000, ...150000 are included here as well,
-- because those migrations use "add column if not exists".

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  specialty text,
  workplace text,
  style text,
  assertiveness text,
  responsiveness text,
  style_driver numeric,
  style_expressive numeric,
  style_amiable numeric,
  style_analytical numeric,
  objections text[] not null default '{}'::text[],
  objection_notes text,
  hidden_concern text,
  key_phrases text,
  meeting_stage text,
  available_time_min integer,
  product_context text,
  plan_objective text,
  plan_success_measure text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctors_assertiveness_check check (assertiveness = any (array['ask'::text, 'tell'::text])),
  constraint doctors_available_time_min_check check (available_time_min is null or available_time_min > 0),
  constraint doctors_responsiveness_check check (responsiveness = any (array['controls'::text, 'emotes'::text])),
  constraint doctors_style_amiable_check check (style_amiable is null or (style_amiable >= 0 and style_amiable <= 1)),
  constraint doctors_style_analytical_check check (style_analytical is null or (style_analytical >= 0 and style_analytical <= 1)),
  constraint doctors_style_check check (style = any (array['driver'::text, 'expressive'::text, 'amiable'::text, 'analytical'::text])),
  constraint doctors_style_driver_check check (style_driver is null or (style_driver >= 0 and style_driver <= 1)),
  constraint doctors_style_expressive_check check (style_expressive is null or (style_expressive >= 0 and style_expressive <= 1))
);
create index if not exists doctors_rep_idx on public.doctors (rep_id, updated_at desc);
alter table public.doctors enable row level security;

create table if not exists public.doctor_visits (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  rep_id uuid not null references public.profiles(id),
  contact_at timestamptz default now(),
  is_contact boolean not null default true,
  source text not null default 'manual',
  note text,
  what_worked text,
  objection_raised text,
  promise_made text,
  promise_done_at timestamptz,
  created_at timestamptz not null default now(),
  constraint doctor_visits_source_check check (source = any (array['manual'::text, 'warmup'::text, 'ai_drill'::text, 'voice_partner'::text, 'voice_partner_opening'::text, 'voice_partner_question'::text, 'voice_partner_fab'::text, 'voice_partner_closing'::text, 'voice_partner_live'::text]))
);
create index if not exists doctor_visits_doctor_id_created_at_idx on public.doctor_visits (doctor_id, created_at desc);
alter table public.doctor_visits enable row level security;

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  challenge_date date not null,
  level integer not null,
  scenario_id integer not null,
  correct boolean not null,
  reaction_ms integer,
  created_at timestamptz not null default now(),
  -- Production has the three-level key from 004. On a fresh database this file runs BEFORE 004, so it creates
  -- the original one-per-day key and lets 004 widen it; on production the whole table already exists.
  constraint daily_challenges_rep_id_challenge_date_key unique (rep_id, challenge_date)
);
create index if not exists daily_rep_date_idx on public.daily_challenges (rep_id, challenge_date desc);
alter table public.daily_challenges enable row level security;

-- Policies, exactly as production names and words them.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'doctors' and policyname = 'doctors owner all') then
    create policy "doctors owner all" on public.doctors for all using (rep_id = auth.uid()) with check (rep_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'doctor_visits' and policyname = 'own doctor visits all') then
    create policy "own doctor visits all" on public.doctor_visits for all using (rep_id = auth.uid())
      with check (rep_id = auth.uid() and doctor_id in (select id from public.doctors where rep_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_challenges' and policyname = 'daily own read') then
    create policy "daily own read" on public.daily_challenges for select using (rep_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_challenges' and policyname = 'daily own insert') then
    create policy "daily own insert" on public.daily_challenges for insert with check (rep_id = auth.uid());
  end if;
end $$;
