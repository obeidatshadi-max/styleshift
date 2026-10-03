create table if not exists public.coach_debriefs (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  input jsonb not null,
  result jsonb not null
);
create index if not exists coach_debriefs_rep_created on public.coach_debriefs(rep_id, created_at desc);
alter table public.coach_debriefs enable row level security;
revoke all on public.coach_debriefs from anon;
grant select, insert, delete on public.coach_debriefs to authenticated;
create policy "Own debriefs select" on public.coach_debriefs for select to authenticated using (rep_id = auth.uid());
create policy "Own debriefs insert" on public.coach_debriefs for insert to authenticated with check (rep_id = auth.uid());
create policy "Own debriefs delete" on public.coach_debriefs for delete to authenticated using (rep_id = auth.uid());
