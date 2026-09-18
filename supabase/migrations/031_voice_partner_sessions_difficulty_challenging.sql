-- Live Voice Practice's own difficulty vocabulary includes 'challenging'
-- (see voice-live-core.ts's LIVE_DIFFICULTY_LEVELS, decoupled from the
-- turn-based modes' supportive/realistic/resistant/pressure_test), which
-- this column's CHECK constraint didn't allow — session-result inserts for
-- Challenging-difficulty live sessions would have failed this constraint.
alter table public.voice_partner_sessions drop constraint voice_partner_sessions_difficulty_check;
alter table public.voice_partner_sessions add constraint voice_partner_sessions_difficulty_check
  check (difficulty = any (array['supportive','realistic','resistant','pressure_test','challenging']));
