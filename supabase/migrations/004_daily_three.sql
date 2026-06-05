-- Daily Challenge: 3 questions per day (one per level) instead of 1.
-- Widen the per-day uniqueness from (rep, date) to (rep, date, level) so all
-- three answers persist as separate rows. A day is "complete" only when a rep
-- has rows for all three levels (enforced in app logic, not the DB).
alter table public.daily_challenges
  drop constraint if exists daily_challenges_rep_id_challenge_date_key;

alter table public.daily_challenges
  add constraint daily_challenges_rep_id_challenge_date_level_key
  unique (rep_id, challenge_date, level);
