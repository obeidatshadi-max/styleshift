# Capability expansion — gap analysis and phased plan (2026-10-08)

Baseline before any change: `npx vitest run` 94 files / 735 tests green, `npx tsc --noEmit` clean.
There is **no lint script** in `package.json` (no eslint configured) — lint cannot be run until one is added.

## What already exists (reuse, do not rebuild)

| Area | Existing | Where |
|---|---|---|
| AI Doctor (voice + text) | persona, 4 difficulties, hidden concern, 5 objection types, physician state (trust/skepticism/engagement/timePressure) | `lib/voice-partner-core.ts`, `agents/doctor/*` |
| Multi-agent pipeline | orchestrator → doctor → behaviorAnalyst → deterministic scorer → coach → report; one shared `StyleShiftSession`; stored as JSON in `agent_sessions.record` | `agents/*`, `schemas/session` |
| Behavior ontology | 7 scored competencies, ~30 behavior keys with points, in JSON config, evidence-grounded (quote must be substring of turn) | `scoring/scoring.config.json`, `schemas/observation`, `schemas/scoring` |
| Reports | evidence/interpretation/certainty separation already in `conversation_reports` | `schemas/conversationReport`, `lib/report/*` |
| Pattern seeds | `findPracticePattern`, Behavioral Gravity, trends dashboard, Pressure Shift | `lib/practice-pattern.ts`, `behavioral-gravity.ts`, `pressure-shift.ts` |
| Doctor history | `doctors`, `doctor_visits` (objections, promises, what_worked), `buildHistoryContext`, visit brief/plan | `lib/doctor-context.ts`, `visit-brief.ts` |
| Admin | manager role (`profiles.role = 'manager'`), `company_scenarios` (MCQ objection drills, draft/approved/archived), `assignments`, company doctors | `lib/company-scenarios.ts`, `lib/assignments.ts` |
| Drills | question / opening / FAB / closing drill sessions | `voice_partner_*_sessions`, `hooks/useQuestionDrill.ts` |
| Flags | env flags `AI_VOICE_PARTNER_ENABLED`, `AI_DRILLS_ENABLED`, ... | grep `ENABLED` |
| Arabic | `lang: 'en'|'ar'`, i18n dictionary with EN/AR key-parity test | `lib/i18n.tsx`, `i18n.integrity.test.ts` |

## Gaps per capability

| # | Capability | Gap | Compat risk |
|---|---|---|---|
| 1 | Scenario Builder | `company_scenarios` is an MCQ drill, **not** an AI-Doctor simulation config. Need a new structured `sim_scenarios` entity. Do not overload `company_scenarios`. | Name clash: new code uses "simulation scenario". Requested 5-level difficulty (receptive/normal/skeptical/resistant/pressure_test) ≠ engine's 4 (`supportive/realistic/resistant/pressure_test`, DB CHECK constraints). Keep engine enum untouched; map. |
| 2 | Knowledge Packs | Nothing beyond prompt guardrails against invention. Need tiered content + sources + retrieval. | Must not let prompts receive unapproved content. |
| 3 | Adaptive engine | Substrate exists (score contributions per behavior). No recency/severity/trend/context cut, no recommendation → targeted-sim loop. | Recommendation must stay separate from `scoring.config.json`. |
| 4 | Micro-practice | 4 bespoke drill hooks/tables. No shared drill template engine. | Existing drill tables stay as-is; new engine is additive. |
| 5 | Capability IQs | Only 7 competency scores + weighted overall. | Do not change `SessionScore` shape; compute IQs as a derived layer. |
| 6 | Practice My Doctor | `buildHistoryContext` feeds last 5 visits into prompts, but facts/inferences/random challenges are not labelled. | Privacy: only the rep's own visit rows. |
| 7 | Methodology Builder | Terminology is hard-coded. | Analytics must keep using ontology keys. |
| 8 | Gamification | XP/streak/leagues exist (`xp_events`, `leagues`, `daily`); they reward volume. | Add mastery/quality signals, don't remove XP. |
| X | Pattern memory | Per-session only; no cross-session event store, no observed→pattern→interpretation→recommendation lifecycle. | Compute from `agent_sessions.record`; no new store needed yet. |

## Phases (each: schema → API → UI → tests → `tsc` → `next build`)

1. **Foundations** (this change): typed schemas + pure validators/services + additive migration 035 + tests. No UI, no routes, no runtime behavior change.
2. Scenario Builder + Micro-practice (manager UI, `/api/sim-scenarios`, drill runner over data templates, `drill_attempts`).
3. Capability IQs + progress (derived layer, evidence-gated).
4. Adaptive Challenge Engine (recommendation → scenario overrides).
5. Practice My Doctor.
6. Methodology Builder UI.
7. Professional gamification.
8. Behavioral Pattern Memory (full detection + interpretation).

## Phase 1 detail

1. Affected architecture: none at runtime. New modules only; `StyleShiftSession` and `scoring.config.json` are read, not modified.
2. New files: `schemas/{scenario,knowledge,drill,methodology,pattern}/index.ts`, `lib/{knowledge-pack,drill-registry,methodology,pattern-events}.ts` + tests; `supabase/migrations/035_capability_foundations.sql`.
3. DB (additive, reversible): `sim_scenarios`, `sim_scenario_assignments`, `knowledge_packs`, `methodologies`. RLS mirrors `company_scenarios`: managers manage own company; members read approved/active/assigned rows. Rollback: `drop table` ×4 (no existing table touched).
4. Types: see schemas. Validators are hand-written (repo has no zod), return `{ok, value} | {ok:false, errors}`.
5. API: none.
6. UI: none.
7. AI prompts: none yet. `knowledge-pack.ts` exposes `selectForPrompt()` so Phase 2+ prompts only ever receive approved, sourced items.
8. Risks: migration written but **not applied** to Supabase; unused tables until Phase 2; scenario `skeptical` has no engine equivalent (mapped to `realistic` + skepticism bias, documented).
9. Backward compat: no existing table/column/type changed; saved reports untouched.
10. Tests: validators (accept/reject), difficulty mapping, knowledge-tier separation + unavailable-reporting, methodology key validation + terminology fallback, pattern-event extraction from a real `SessionScore`.

## Phase 2 detail (Scenario Builder + Micro-practice)

1. Architecture touched: orchestrator `start()` (optional `persona` + `scenarioId`; `doctorId` now optional), `StyleShiftSession` (optional `scenarioId`), `/api/simulation/start` (optional `scenarioId`), `useTextSimulation`/`TextSimulation` (optional `scenarioId`), `GameHome` (two cards), manager dashboard (one panel), `privacy.ts` (new history table).
2. Scenarios reuse the saved-doctor path: `doctorFromScenario` builds an in-memory `Doctor`, then the existing `personaFromDoctor` maps it. The doctor agent, analyst and scorer need no change.
3. DB: migration 036 `drill_attempts` (own-row RLS; stores derived result only, never the rep's text).
4. API: `/api/sim-scenarios` (GET, POST), `/[id]` (GET, PUT, PATCH status), `/[id]/duplicate`, `/[id]/assign` (GET, POST, DELETE), `/mine`; `/api/micro-practice` (GET), `/attempt` (POST). Flags: `SCENARIO_BUILDER_ENABLED`, `MICRO_PRACTICE_ENABLED` (off = 404).
5. Governance: editing an approved scenario returns it to draft; reps can start only approved scenarios assigned to them or the whole company; managers can test any scenario of their company.
6. Drills: 15 English templates as data (`lib/drill-templates.ts`); responses analysed by the existing Behavior Analyst, scored deterministically; unassessable replies are not stored and do not use a retry; retries capped per drill per UTC day.
7. Not in this phase: knowledge-pack content reaching the doctor prompt (the link is stored and flagged in the preview), Arabic drills, scoring-weight changes.

## Phase 3 detail (Capability IQ scores)

1. Derived layer only: `SessionScore`, `scoring.config.json` and saved reports are untouched. Input is the Phase 1 behavior events built from stored scored simulations (`agent_sessions`); no new table.
2. `scoring/capability.config.json` maps scoring-catalog behaviors to five dimensions (each behavior in exactly one), with weights, window, minimum evidence, trend and rounding rules. Weights are changed in config, not code.
3. Rules: a dimension is scored only with at least 3 behavior events across at least 2 sessions; score is rounded to steps of 5 and shown with a band; confidence and trend are reported separately; no overall score; every score opens to the behaviors and the rep's own words behind it.
4. Clinical IQ currently measures use of evidence and relevance of claims from what was said. Accuracy against approved sources needs a linked knowledge pack and is stated as not measured.
5. Flag `CAPABILITY_IQ_ENABLED`; route `/api/progress/capability`; Home card `CapabilityCard`.
6. Update after merging main: four scoring-catalog behaviors added by the precision-questioning work (`specifying_question`, `what_stops_question`, `checked_interpretation`, `accepted_vague_objection`) were not in any dimension; they are now mapped and a test fails if a catalog behavior is ever left out.
7. Not in this phase: drill attempts do not feed the dimensions (they keep no evidence text); report-level split of behavioral vs clinical/message feedback; manager view.

## Phase 4 detail (Adaptive Challenge Engine)

1. Loop: stored scored sessions -> behavior events -> recurring patterns (`pattern-records.ts`, reusable by Phase 8) -> ranked weaknesses -> one recommended exercise (a quick drill plus a targeted simulation) -> sessions tagged with the behavior they target -> before/after comparison.
2. Only behaviors that cost points in the scoring catalog can be recommended (`challenge-map.ts`, a test enforces full coverage). A weakness needs 3 distinct sessions, and is dropped if absent from the 5 newest.
3. Ranking is deterministic: frequency 0.4, severity 0.3, recency 0.2, trend bonus. The targeted simulation uses the physician style, objection and difficulty where the behavior actually appeared, one step harder unless the pattern is worsening; pressure_test only from resistant doctors when improving.
4. The server recomputes the target from the rep's own history on start; the request body cannot choose it. A recommendation never changes scoring config (`changesScoringConfig: false`).
5. The card separates what the sessions show, a hedged reading ("may be a habit... not a fixed trait") with a confidence label, and what to practise. Progress is shown with a caveat that targeted sessions are harder.
6. Flag `ADAPTIVE_CHALLENGES_ENABLED`; targeted start also needs the simulation flags. No migration: the target is stored in the existing session JSON.

## Phase 5 detail (Practice my doctor)

1. Positioned as a context-informed simulation of the likely interaction, never a copy of a person. Only the rep's own records are read (doctor profile, visits, coach debriefs) through row-level security; another rep's doctor id resolves to nothing.
2. Three kinds of content are kept apart end to end (preview, prompt, stored session): facts the rep recorded (verbatim, clipped, with source), inferences (hedged, each pointing at the facts it rests on, never emotions, motives or prescribing), and a random practice challenge labelled as invented. The doctor agent is told which is which and not to claim memories beyond the list. Rep-written text is quoted so it cannot act as instructions.
3. "Practice my next visit": a suggested doctor from open promises, a visit plan, a coach next action and time since contact, with the reason shown and the doctor changeable. There is no visit calendar, so it is a suggestion.
4. The rep sees the full preview before starting and can switch off any recorded fact; inferences that rested on it drop out. The preview seed fixes the challenge so what is shown is what runs.
5. Flag `PRACTICE_MY_DOCTOR_ENABLED` (start also needs the simulation flags). No migration; the session stores only ids of the facts, inferences and challenge it was given.
6. Not in this phase: showing the assumptions inside the finished report; Arabic review of the new text; voice mode.

## Phase 6 detail (Methodology Builder)

1. A methodology is configuration over the fixed behavior list: stages (order, optional, weight, expected and prohibited behaviors, required evidence, coaching prompts), a company name for any behavior, and a company name for each of the five capability dimensions. No new detectors: two companies with different wording get identical analytics (tested).
2. Governance: managers only; one active methodology per company; activating archives the current one; editing the ACTIVE one creates a new draft version and leaves what reps see untouched until activation. A stored config that no longer validates is ignored.
3. Where it shows up: rep-facing behavior and dimension names (capability card, recommended-practice card), a "stages" card for the rep (seen, partly seen, not seen, needs attention, per stage, no score), and the AI Coach: each new simulation snapshots the active methodology onto the session, and the coach prompt gets the company names and stage guidance only for the behaviors being coached. Company text is quoted and the coach is told it is data, not instructions.
4. Three starter templates (generic four-stage structures; not copies of any vendor model).
5. Flag `METHODOLOGY_BUILDER_ENABLED`. No migration beyond 035 (table `methodologies`).
6. Not in this phase: analyst or doctor prompts do not use the methodology; the shared conversation-report pipeline is not yet methodology-aware; stage weights are stored and shown but no stage-level score is computed; Arabic stage prompts are entered in English only in the builder.
