-- AI Doctor Phase 4: Pressure Shift — see docs/ai-doctor-phase-1-plan.md's
-- "Deferred / Phase 4" note and src/lib/pressure-shift.ts's header comment.
--
-- SCOPE NOTE: this phase ships TEXT-ONLY. The Phase 1 plan named Phase 4 as
-- requiring acoustic capture (pitch/pause) added to the AI Doctor path, the
-- same way roleplay-core.ts's engine works for the human-colleague path.
-- That capture does not exist today: src/hooks/useAudioRecorder.ts only owns
-- a MediaRecorder blob for Whisper transcription, with no AnalyserNode/pitch
-- sampling and no diarization step. Building that is a separate initiative
-- (new client instrumentation + a pitch-detection approach), not a "wire it
-- up" task, and was deliberately NOT bundled into this migration or this
-- phase so Phase 4 could ship now on the physician-state signals migration
-- 026 already staged for it. No acoustic columns are added here — adding
-- them can be a later, additive migration once that capture actually exists.

-- Extends session_scorecards (migration 027/028) rather than a new table —
-- same reasoning as Phase 3: Pressure Shift is derived from the exact same
-- transcript, computed and upserted in the same request/lifecycle as
-- competencies/adaptation, with the same RLS already in place on this table.
alter table public.session_scorecards
  -- turn_index of the detected pressure moment (see findPressureMoment in
  -- pressure-shift.ts); null when no session-analysis run detected one.
  add column if not exists pressure_shift_turn_index integer,
  -- WindowMetrics snapshots (turnCount/avgWordsPerTurn/questionRatio/
  -- openQuestionRatio/paraphraseScore/clearStepsPerTurn) — see pressure-
  -- shift.ts's WindowMetrics type for the exact shape. Both null together
  -- when no pressure moment was found.
  add column if not exists pressure_shift_before jsonb,
  add column if not exists pressure_shift_after jsonb,
  -- One model-written sentence interpreting the before/after numbers above
  -- (never the source of the numbers themselves — those are computed
  -- server-side in pressure-shift.ts and only handed to the model as
  -- context, same anti-hallucination rule as every other scorecard field).
  add column if not exists pressure_shift_insight text;
