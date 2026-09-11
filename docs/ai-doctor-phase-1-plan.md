# AI Doctor 2.0 — Phase 1 Plan ("make the physician feel realistic")

Scope: Phase 1 only (per the release plan — persona, state, dynamic conversation, scenario model, objection engine, hidden concerns, difficulty, improved doctor prompt, and the minimum transcript persistence every later phase depends on). Phases 2–7 are named at the end, not designed.

Every item states **reuse** (extend existing file/table) vs **new** explicitly, per audit findings.

## 1.1 Persist the transcript (blocking prerequisite — do this first)

**New.** Today `voice_partner_sessions` (migration 014) stores only the aggregate outcome; the turn-by-turn conversation lives only in client memory and is discarded. Every later phase (Critical Moments, Pressure Shift, evidence-grounded coaching, Behavioral Gravity) needs the transcript with timestamps.

- New migration: `conversation_turns` table — `session_id` (FK to `voice_partner_sessions`), `turn_index`, `role ('doctor'|'rep')`, `text`, `objection_type`, `clear_steps_hit text[]`, `created_at`.
- `turn/route.ts` already builds every field needed per turn (`repText`, `judged.doctorReply`, `judged.clearSteps`) — add one insert per turn. No new AI call.
- Keep `voice_partner_sessions` as the fast-read aggregate; `conversation_turns` is the evidence store deep analysis (Phase 2+) will query.

## 1.2 Split DoctorAgent from scoring (structural fix, not a rewrite)

**Extend `voice-partner-core.ts` + `turn/route.ts`.** Today `buildJudgePrompt`/`parseJudgeResponse` make ONE Claude call produce both the in-character `doctorReply` AND the `verdict`/`clearSteps` judgment — this violates "DoctorAgent must NOT perform final scoring" and "keep live simulation separate from deep post-call analysis" directly.

Phase 1 fix (still real-time, still one round-trip budget — do not add live latency):
- Keep ONE model call per turn (cost/latency reasons stand for live play), but split the RESPONSE SCHEMA into two logically separate objects: `{ doctorReply }` from a persona-only instruction block, and `{ observerSignal: { objectionAddressed: bool, clearSteps[] } }` from a separate, clearly-labeled evaluation block in the same prompt. This is the pragmatic Phase-1 step; true separation (two calls, or moving the evaluator to an async post-turn job) is a Phase 2 change once `conversation_turns` (1.1) exists to evaluate against.
- Rename `verdict` handling: the model no longer decides `win`/`escalate` as "scoring" — it decides "does the doctor's resistance continue" (a persona/state decision), and a **separate, deterministic** `resolveTurn()`-style function decides the pedagogical outcome from CLEAR-step coverage + turn count. This is what actually separates "physician reaction" from "evaluation" without adding a second live LLM call.

## 1.3 Physician state engine

**New**, additive to the existing `Doctor` persona (do not replace it).

- In-memory only for Phase 1 (no new table) — the state is per-session, seeded from the persona + `doctor_visits` history, and threaded through `turn/route.ts` as a small object alongside `history`: `{ trust: number, skepticism: number, engagement: number, timePressure: number }`, 0–100, initialized from style + `assertiveness`/`responsiveness`.
- `buildJudgePrompt` gets a new internal-only section instructing the model how CURRENT state (not shown to the rep) modulates tone — e.g. low trust → shorter, more skeptical replies. The model still returns `doctorReply` in character; it additionally returns a small state delta (`{ trustDelta, skepticismDelta, engagementDelta }`, each -10..+10) which `turn/route.ts` applies and carries to the next turn's prompt. Never surfaced to the client UI.
- Persisting state snapshots per turn into `conversation_turns` (1.1) is what makes Pressure Shift (Phase 4) possible later — add the four state columns to that table now even though nothing reads them until Phase 4, since it's a zero-cost column addition at the same migration.

## 1.4 Weighted physician persona (extend, don't replace `Doctor`)

**Extend.** `doctors` table keeps its single `style` column (backward compatible — every existing feature reads it). Add nullable weight columns: `style_driver, style_expressive, style_amiable, style_analytical numeric` (sum-to-1, nullable = "use legacy single style"). `personaLines()` in `voice-partner-core.ts` reads the weighted blend when present, falls back to the existing single-style DRIVE line otherwise. No breaking change to `generate-scenario` or the company-scenario system, which stay on single-style.

## 1.5 Hidden concerns

**New**, small addition to `doctors`/scenario input, not a new subsystem.

- Add `hidden_concern text` (nullable) to `doctors` — a manager/rep-authored true reason distinct from the spoken `objections[]`. `buildJudgePrompt` gets an instruction: never state `hidden_concern` directly; only let it surface if the rep's reply pattern-matches "good open questioning" (reuse the `clarify`/CLEAR-step signal already computed) — reward with a `doctorReply` that partially reveals it.
- This reuses the existing CLEAR-step vocabulary rather than inventing a new "discovery" mechanic.

## 1.6 Objection variability tied to persona/history

**Extend `pickObjectionType()`.** Currently uniform-random across the 5 `ObjectionType`s. Phase 1: weight selection by (a) the doctor's `objections[]` category, via the existing `cognitive-biases.ts`/`social-style.ts` `ObjectionCategory` mapping (reuse — currently only wired into company-scenario drills, not voice-partner), and (b) whether recent `doctor_visits` show the same objection already resolved (favor a different type). Still deterministic/testable — this is a pure function change, same shape as the existing `cognitive-biases.test.ts` pattern.

## 1.7 Difficulty levels

**New**, minimal for Phase 1: a 4-value enum (`supportive|realistic|resistant|pressure_test`) stored per session (column on `voice_partner_sessions`, chosen at session start — UI already has a doctor-select step in `VoicePartner.tsx` to extend). Phase 1 only wires it into the PROMPT (resistance tone, willingness to concede) — the harder pressure-test behaviors (interruption, time pressure, mixed objections) are Phase 4+ once state (1.3) and multi-signal detection exist. Do not fake difficulty by just making the doctor "ruder" — reuse the state deltas from 1.3 (lower starting trust/engagement, faster skepticism rise) to implement it structurally.

## 1.8 Scenario model fields

**Extend, not new table.** Add nullable columns to `doctors` (or a new lightweight `voice_partner_scenarios` join if a doctor needs multiple named scenarios — decide based on whether "one scenario per doctor" holds after reviewing `VoicePartner.tsx`'s current doctor-select flow, out of Phase-0 scope to confirm): `product_context text`, `meeting_stage text`, `available_time_min integer`. These feed `personaLines()`/`buildJudgePrompt` as additional context lines, same pattern as the existing `specialtyLabel`/`domainFlavor` injection.

## Explicit reuse vs. new-build summary

| Phase 1 item | Reuse | New |
|---|---|---|
| Transcript persistence | `voice_partner_sessions` schema pattern, `turn/route.ts` data already computed | `conversation_turns` table |
| DoctorAgent/scoring split | `resolveTurn()`, CLEAR-step vocabulary, existing single Claude call | Restructured prompt schema |
| Physician state | `doctor_visits` as seed, existing prompt-injection pattern (`personaLines`) | In-memory state object + state-delta return field |
| Weighted persona | `Doctor` type, `DRIVE` map, `social-style.ts` axes | 4 nullable weight columns |
| Hidden concerns | CLEAR `clarify` signal already computed | `hidden_concern` column |
| Objection variability | `cognitive-biases.ts`, `social-style.ts` categories, `doctor_visits` | Weighted-selection function replacing uniform `pickObjectionType` |
| Difficulty | State-delta mechanism from 1.3, existing doctor-select UI | 4-value enum column + prompt wiring |
| Scenario fields | `personaLines()` injection pattern | 3 nullable columns |

## Database changes (Phase 1 total)

- New table: `conversation_turns` (see 1.1, includes state-snapshot columns for future Phase 4 use).
- `ALTER TABLE doctors ADD COLUMN`: `style_driver/expressive/amiable/analytical numeric` (nullable), `hidden_concern text`, `product_context text`, `meeting_stage text`, `available_time_min integer`.
- `ALTER TABLE voice_partner_sessions ADD COLUMN difficulty text CHECK (...)`.
- No changes to `roleplay_sessions`, `company_scenarios`, or any gamification table.

## Deferred (named only, not designed here)

- **Phase 2 — Evaluation:** evidence extraction against `conversation_turns`, unified scorecard across voice-partner CLEAR-steps and roleplay acoustic metrics, Critical Moments.
- **Phase 3 — Adaptation Intelligence:** rep-style inference (reuse `roleplay-core.ts`'s `classifySocialStyle`, currently colleague-roleplay-only), Adaptation Score.
- **Phase 4 — Pressure Intelligence:** Pressure Shift, requires acoustic capture added to the AI Doctor path (today text-only) plus the state-snapshot columns staged in 1.1.
- **Phase 5 — Behavioral Pattern Intelligence:** Behavioral Gravity (extend `roleplay-aggregate.ts`'s trend logic with trigger→response→consequence structure), Unused Resource Detector.
- **Phase 6 — Adaptive Coaching:** Mastermind Coach, personalized re-practice (extend `coaching-queue.ts`).
- **Phase 7 — Evolution & Management:** readiness, longitudinal Behavioral Evolution across both session types, manager analytics extensions to existing dashboard panels.

## Testing (Phase 1)

Follow the existing colocated-`*.test.ts` convention (19 files today). New/changed pure functions needing tests: weighted-objection selection (1.6), state-delta application (1.3), difficulty→state-seed mapping (1.7). Route-level changes (`turn/route.ts` transcript insert, schema split) get integration coverage the way `voice-partner-core.test.ts` already covers `resolveTurn`/`parseJudgeResponse`.
