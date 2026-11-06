# StyleShift: current capability inventory (Phase B, Checkpoint 1)

Written 2026-11-06 from `main` at `09b0e6a`. Status words: **Implemented and verified**, **Implemented but unverified**, **Partially implemented**, **Proposed**, **Missing**, **Blocked**. "Verified" means checked by tests or by reading production, not by the code existing.

Nothing here is a pilot result. No human rating, no real-audio benchmark and no field outcome exists yet.

## Inventory

| Capability | Current implementation | Evidence | Remaining gap | Decision |
|---|---|---|---|---|
| Security and permissions | Row-level security on every table; profile authority trigger; server routes authenticate; hardening applied to production 2026-11-06 | Phase A audit; 45 real-database attack tests; production catalog read and re-read | Supabase Auth and Netlify settings, signed-in walk-through, Health360 tables (shared project) not checked. **Implemented and verified** for what was tested | Keep; finish the unverified items |
| Database migrations | 54 files; all load on a clean Postgres | Phase A | Production drifted from the files: three tables never created by them, helper functions and policies only in production, history names differ, two files numbered 030. **Partially implemented** | Commit a baseline snapshot of production's schema before adding Phase B tables |
| Session evaluation | `session-evaluator.ts`: 9 competencies (opening, questioning, discovery, listening, relevance, value_communication, evidence_use, objection_handling, closing) and 7 adaptation dimensions (pace, detail, evidence_orientation, questioning, structure, directness, warmth), scored 0 to 100 or null, with turn references checked against the real transcript | `docs/behavioral-improvement-engine.md`; grounding tests | **Accuracy against human raters is unknown.** Quotes and turn numbers are derived from the real rows, so evidence cannot be invented, but a score can still be wrong. **Implemented but unverified** | Reuse as is; this is what the pilot measures |
| Conversation report | `ConversationReport`: 8 performance dimensions with evidence references, critical moments, commitments, social-style section, usual-pattern view (PR #82 to #84); every quote resolved from the transcript | Report grounding tests (usualVsToday, groundReport) | No human comparison. Certainty uses three words (stated, inferred, not_established), not numbers. **Implemented but unverified** | Reuse; compare with human ratings |
| Behavioral Evolution | `evolution.ts`, `snapshot.ts`: recent vs earlier window per metric and source; under 4 sessions says "insufficient"; 5-point noise floor | 29 engine tests; mutation checks | Thresholds are reasoned defaults, not validated on Iraqi pilot data. **Implemented but unverified** | Keep; the pilot tests whether the signal tracks human-rated change |
| Coaching roadmap | `roadmap.ts`: max 3 items from declining metrics and Mastermind patterns, each with an existing drill and a success test | Engine tests | Whether the recommended drill improves the targeted behavior is untested. **Implemented but unverified** | Reuse; evaluate in the pilot |
| Measurement separation | Metrics keep their source (AI Doctor, colleague role-play, drill) and are never merged; evidence tiers `observed_practice`, `self_reported`, `verified_field` | `metrics.ts`, DB constraint on field checks | No test that scores from different sources mean the same thing. They are correctly kept apart. **Implemented and verified** (separation only) | Do not add a composite score |
| Manager verification | A manager records seen, not seen or unclear against a follow-up; a rep cannot verify themselves (code and DB constraint) | Phase A tests | One manager's yes or no; not linked to a recorded customer visit; no third party; no sales data. **Partially implemented** | Report as manager-confirmed, never as independently verified |
| Claim checking | `claim-check.ts` removes unsupported sentences from coach debriefs (PR #66) | Debrief tests | **Covers coach debriefs only**, not conversation reports or evaluator output. An unsupported-claim rate for those needs human adjudication. **Partially implemented** | Build adjudication of AI claims in the pilot |
| Physician state in AI Doctor | Each turn stores a physician-state snapshot (trust, skepticism, engagement, time pressure) from the AI judge; `pressure-shift.ts` compares text signals before and after a detected pressure moment | Migration 026, `pressure-shift.ts` | The values are **simulated state, not measurements of anything real**. They come from a language model, so transitions are not deterministic or documented, and nothing tests their consistency across repeated runs. **Partially implemented** | Add deterministic scenario definitions and a consistency check (protocol, section 5) |
| Human benchmark scoring | None | n/a | No rubric, rater workflow, adjudication, or agreement statistics. **Missing** | Build (PR B2 and B3) |
| Arabic transcription evaluation | Transcription is OpenAI Whisper with language pinned to `ar` or `en`; AssemblyAI is used for speaker separation of recorded roleplays; IHIA phrase library (flag-gated) | `/api/transcribe`, `assemblyai-client.ts`, `docs/IHIA.md` | No reference transcripts, no error rates, no provider comparison, no check that meaning (negation, questions) survives. **Missing** | Build tooling; recordings and reviewers must come from people |
| Evidence traceability | Report evidence resolves to real transcript segments; evaluator turn references are filtered to existing turns; quotes are never model-written | Grounding tests | Strong for quotes. No check that the cited line actually supports the claim: that is a human judgement. **Implemented and verified** (resolution only) | Add a human "supports the claim" rating |
| Pilot reporting | Manager improvement board; opt-in sharing | Existing UI | Nothing reports measurement trust, agreement, Arabic readiness, or coaching effect. **Partially implemented** | Build the validation dashboard last |
| Privacy of recordings | Audio deleted at the provider after analysis, now acknowledged and retried (Phase A); recorder auto-stops | Phase A tests | Deletion is acknowledged, not verified afterwards. **Implemented but unverified** | Keep; no recordings leave de-identified storage |

## Pull requests reviewed (as asked)

#61 opt-in manager sharing; #62 null handling for coaching insights; #63 delete the transcript and audio at AssemblyAI; #64 stop long recordings; #65 Behavioral Improvement Engine; #66 check coach debrief sentences. All merged. Later work reviewed: #67 to #88 (key messages, IHIA, certification, PIN reset, reset-link, usual-pattern view, calls side by side, Phase A). One open branch, #59 (Arena link preview), is unrelated.

## What the pilot can and cannot reuse

Reuse: the evaluator and report (as the thing being validated), the improvement engine (practice, self-reported and verified tiers), drills, the claim-check pattern, the evidence resolution, the real-database test harness from Phase A.

Do not duplicate: no new competency scoring, no second report pipeline, no composite score.

Build: rubric and rater workflow, adjudication, agreement statistics, deterministic scenarios with a consistency check, the Arabic benchmark tooling, validation tables with row-level security, and the executive dashboard.

## Decisions that follow from this inventory

1. Phase B tables are added only after a baseline snapshot of the production schema is committed, so they can be tested against something that resembles production.
2. Human-only rubric domains (state adaptation, composure) have no AI counterpart; they are rated but excluded from AI-human agreement until an AI measure exists. See `human-rating-rubric.md`.
3. The "unsupported major claim" rate is measured by human adjudication of AI claims, because the existing claim checker does not cover reports.
