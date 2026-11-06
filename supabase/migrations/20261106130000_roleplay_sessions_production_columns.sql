-- roleplay_sessions: three columns production has that no migration file adds.
-- Production history records "roleplay_sessions_adaptation_score"; partner_style and partner_confidence were
-- added by hand. The app reads them (useColleagueSessions, useDoctorRoleplaySessions, session-analysis route).
-- Idempotent: a no-op on production, where all three already exist with these types (read from pg_catalog 2026-11-06).
alter table public.roleplay_sessions
  add column if not exists adaptation_score integer,
  add column if not exists partner_confidence integer,
  add column if not exists partner_style text;
