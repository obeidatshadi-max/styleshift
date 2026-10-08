-- Micro-practice drill attempts (Phase 2). ADDITIVE ONLY: one new table.
-- Rollback: drop table public.drill_attempts;
--
-- Privacy shape: the rep's typed response is NOT stored. A row keeps only the
-- derived result (which scoring-catalog behaviors were observed, the score,
-- pass/fail), the same "scores and metadata, not the raw content" rule the
-- other practice-history tables follow (see 022). Evidence quotes are shown
-- to the rep once, in the attempt response, and are not persisted.
create table public.drill_attempts (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  drill_id text not null,
  drill_version int not null default 1,
  attempt_no int not null check (attempt_no >= 1),
  lang text not null check (lang in ('en', 'ar')),
  observed_behaviors text[] not null default '{}',
  score int check (score between 0 and 100),
  passed boolean not null default false,
  created_at timestamptz not null default now()
);

create index drill_attempts_rep_drill_idx on public.drill_attempts (rep_id, drill_id, created_at desc);

alter table public.drill_attempts enable row level security;

create policy "own drill attempts read" on public.drill_attempts
  for select using (rep_id = auth.uid());
create policy "own drill attempts insert" on public.drill_attempts
  for insert with check (rep_id = auth.uid());
-- Same governance as the other practice-history tables (see 022).
create policy "own drill attempts delete" on public.drill_attempts
  for delete using (rep_id = auth.uid());
