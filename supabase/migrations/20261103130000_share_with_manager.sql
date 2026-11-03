-- A rep can choose to share one text simulation or one coach debrief with their manager.
-- Off by default: NULL means private. The column holds WHEN the rep shared it, so un-sharing is
-- just setting it back to NULL. No RLS change on purpose: both tables stay owner-only for direct
-- reads, and the only path that sets or reads this flag is server code that checks ownership
-- (rep side) or company membership (manager side).
alter table public.agent_sessions add column if not exists shared_with_manager_at timestamptz;
alter table public.coach_debriefs add column if not exists shared_with_manager_at timestamptz;

create index if not exists agent_sessions_shared_idx on public.agent_sessions (rep_id, created_at desc)
  where shared_with_manager_at is not null;
create index if not exists coach_debriefs_shared_idx on public.coach_debriefs (rep_id, created_at desc)
  where shared_with_manager_at is not null;
