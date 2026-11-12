-- AI-Doctor transcripts and results are written only by the server (validation audit 2026-11-12, W5).
--
-- Before this, a rep could insert their own voice_partner_sessions row straight from the
-- browser, with any outcome, and certification reads win rate from these rows. A rep could
-- also insert conversation_turns rows, which the server now reads to rebuild a session's
-- turn count and CLEAR steps. The voice-partner routes (open, turn, live-judge,
-- replay-context) now write both tables with the service role after checking the rep and
-- the doctor, so reps need no insert right on either.
-- Read, manager-read, own-delete and the turn-timing update policies are unchanged.

drop policy if exists "own voice partner sessions insert" on public.voice_partner_sessions;
drop policy if exists "own conversation turns insert" on public.conversation_turns;
