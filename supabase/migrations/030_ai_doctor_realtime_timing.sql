-- AI Doctor realtime hardening: real per-turn speech timing, captured only
-- by the realtime voice path (bot.py). The text-based path never populates
-- these — every existing row and query keeps working with them null.
-- See docs/superpowers/plans/2026-09-16-ai-doctor-realtime-hardening.md.
alter table public.conversation_turns
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;
