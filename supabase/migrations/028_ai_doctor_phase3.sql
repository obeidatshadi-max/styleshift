-- AI Doctor Phase 3: Adaptation Intelligence — see docs/ai-doctor-phase-1-plan.md's
-- "Deferred / Phase 3" note. Computed in the SAME evaluator call as Phase 2's
-- competency scoring (session-analysis/route.ts), not a second LLM call.

-- Extends session_scorecards (migration 027) rather than a new table:
-- adaptation is derived from the exact same transcript, computed and
-- upserted in the same request, with the same one-row-per-session
-- lifecycle as `competencies`/`signals` — a separate table would just mean
-- an extra join for something that always renders together, with an
-- identical RLS policy set to duplicate.
alter table public.session_scorecards
  -- Record<AdaptationDimension, {score, turnRefs, rationale}> — see
  -- src/lib/session-evaluator.ts's AdaptationScores type for the exact shape.
  add column if not exists adaptation jsonb,
  -- Composite 0-100, computed server-side from the grounded per-dimension
  -- scores (never taken from the model directly) — null when every
  -- dimension came back "insufficient data".
  add column if not exists adaptation_score integer check (adaptation_score is null or (adaptation_score >= 0 and adaptation_score <= 100)),
  add column if not exists adaptation_recommendation text,
  -- Snapshot of the doctor's resolved style profile AT ANALYSIS TIME (see
  -- resolveDoctorStyleProfile) — not re-derived live from `doctors` on
  -- every read, so a later edit to a doctor's style weights doesn't change
  -- what a past session's recommendation is explained against.
  add column if not exists doctor_style_profile jsonb;
