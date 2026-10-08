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
6. Not in this phase: drill attempts do not feed the dimensions (they keep no evidence text); report-level split of behavioral vs clinical/message feedback; manager view.
