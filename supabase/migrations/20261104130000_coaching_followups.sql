-- Behavioral Improvement Engine: manager follow-ups on a rep's coaching roadmap, and the
-- field evidence attached to them. ADDITIVE ONLY: two new tables.
-- Rollback: drop table public.coaching_field_checks; drop table public.coaching_followups;
--
-- Evidence rule (enforced here, not only in the app): a follow-up's PRACTICE evidence is
-- computed from existing practice tables and never stored. Field evidence is stored in
-- coaching_field_checks and has two kinds that cannot be confused:
--   self_reported - written BY the rep about their own real visit
--   verified      - written by SOMEONE ELSE (the manager) who saw it in the field
-- The check constraint makes a rep unable to record a "verified" entry for themselves.
--
-- All writes go through API routes using the service-role client with explicit company and
-- role checks (same pattern as assignments, 005). These policies only keep direct reads safe.

create table public.coaching_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  metric_key text check (metric_key is null or metric_key in (
    'open_question_ratio', 'paraphrase_score', 'active_listening', 'talk_ratio',
    'adaptation_score', 'clear_steps_per_turn', 'drill_score')),
  source text check (source is null or source in ('ai_doctor', 'colleague_roleplay', 'drill')),
  drill_kind text not null check (drill_kind in (
    'precision_drill', 'ai_doctor_objection', 'colleague_roleplay', 'micro_practice')),
  objection_type text check (objection_type is null or objection_type in (
    'wrong_info', 'doubt', 'true_objection', 'indifference', 'false_objection')),
  clear_step text check (clear_step is null or clear_step in ('clarify', 'listen', 'empathy', 'answer', 'recheck')),
  -- Measured by the server when the follow-up is created; never taken from the client.
  baseline_value numeric,
  baseline_n int not null default 0 check (baseline_n >= 0),
  note text check (note is null or char_length(note) <= 300),
  due_date date,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index coaching_followups_rep_idx on public.coaching_followups (rep_id, created_at desc);
create index coaching_followups_company_idx on public.coaching_followups (company_id, created_at desc);
-- One open follow-up per rep per focus: assigning the same thing twice is a no-op, not a duplicate.
create unique index coaching_followups_one_open on public.coaching_followups
  (rep_id, coalesce(metric_key, ''), coalesce(source, ''), drill_kind, coalesce(objection_type, ''), coalesce(clear_step, ''))
  where closed_at is null;

create table public.coaching_field_checks (
  id uuid primary key default gen_random_uuid(),
  followup_id uuid not null references public.coaching_followups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('self_reported', 'verified')),
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  observed text not null check (observed in ('seen', 'not_seen', 'unclear')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  constraint field_check_author_matches_kind check (
    (kind = 'self_reported' and recorded_by = rep_id) or
    (kind = 'verified' and recorded_by <> rep_id)
  )
);

create index coaching_field_checks_followup_idx on public.coaching_field_checks (followup_id, created_at);

alter table public.coaching_followups enable row level security;
alter table public.coaching_field_checks enable row level security;

create policy "rep reads own followups" on public.coaching_followups
  for select using (rep_id = auth.uid());
create policy "manager reads company followups" on public.coaching_followups
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
  );

create policy "rep reads own field checks" on public.coaching_field_checks
  for select using (rep_id = auth.uid());
create policy "manager reads company field checks" on public.coaching_field_checks
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
  );
-- No update or delete policy on field checks: an observation is a record, not a draft.
