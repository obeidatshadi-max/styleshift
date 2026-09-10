-- Funnel instrumentation for the invite→signup→first-drill path (mirrors
-- 021_voice_events.sql's shape). rep_id is nullable because the first stage,
-- 'link_opened', fires from an unauthenticated visitor on /invite/[code] —
-- there is no rep yet, only the company the code resolves to.
create table public.invite_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rep_id uuid references public.profiles(id) on delete cascade,
  stage text not null check (stage in ('link_opened', 'signup_completed', 'first_drill_completed')),
  meta jsonb,
  created_at timestamptz not null default now()
);

create index invite_events_company_time on public.invite_events (company_id, created_at);
create index invite_events_rep on public.invite_events (rep_id);

alter table public.invite_events enable row level security;

-- No visitor-facing select policy — anonymous 'link_opened' rows are written
-- by the admin client from a public API route (like every other insert on
-- this table) and read back only by managers, never by the rep/visitor.
create policy "manager invite events read" on public.invite_events for select using (
  company_id in (
    select company_id from public.profiles where id = auth.uid() and role = 'manager'
  )
);
