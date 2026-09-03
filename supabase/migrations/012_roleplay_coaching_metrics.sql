-- Three new coaching metrics from the roleplay verbal-mirror pipeline —
-- open vs. closed question ratio, paraphrase/rephrase score, and an
-- active-listening composite. Same privacy shape as the existing columns:
-- only the derived numbers, never any transcript text.
alter table public.roleplay_sessions
  add column open_question_ratio numeric check (open_question_ratio between 0 and 1),
  add column paraphrase_score numeric check (paraphrase_score between 0 and 1),
  add column active_listening_score integer check (active_listening_score between 0 and 100);
