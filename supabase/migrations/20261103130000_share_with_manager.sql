-- A rep can choose to share one text simulation or one coach debrief with their manager.
-- Off by default: NULL means private. shared_with_manager_at holds WHEN the rep shared it, and
-- shared_with_company_id holds WHICH team they shared it with at that moment. A manager only ever
-- sees items shared with their own company, so a rep who later joins another team does not hand old
-- shares to the new manager. Un-sharing sets both back to NULL.
-- No RLS change on purpose: both tables stay owner-only for direct reads, and the only paths that set
-- or read these columns are server code that checks ownership (rep side) or company (manager side).
alter table public.agent_sessions
  add column if not exists shared_with_manager_at timestamptz,
  add column if not exists shared_with_company_id uuid references public.companies(id) on delete set null;
alter table public.coach_debriefs
  add column if not exists shared_with_manager_at timestamptz,
  add column if not exists shared_with_company_id uuid references public.companies(id) on delete set null;

create index if not exists agent_sessions_shared_idx on public.agent_sessions (shared_with_company_id, created_at desc)
  where shared_with_manager_at is not null;
create index if not exists coach_debriefs_shared_idx on public.coach_debriefs (shared_with_company_id, created_at desc)
  where shared_with_manager_at is not null;
