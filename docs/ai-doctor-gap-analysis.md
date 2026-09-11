# AI Doctor — Gap Analysis

Based on `docs/ai-doctor-audit.md`. Existing/Partial/Missing reflects code actually found, not assumption.

| Capability | Existing | Partial | Missing | Priority | Recommended Phase |
|---|---|---|---|---|---|
| Dynamic AI physician | | ✅ (`voice-partner-core.ts` turn/route.ts — reacts to last reply only, no multi-turn state) | | High | 1 |
| Physician persona | | ✅ (`Doctor` row: name/specialty/style/key_phrases/objections — flat, single style, no weighted blend) | | High | 1 |
| Physician behavioral style | | ✅ (single categorical style from `social-style.ts` axes; not a weighted Driver/Analytical/Expressive/Amiable mix) | | Med | 1 |
| Physician conversational state | | | ✅ (no interest/trust/skepticism/engagement variables — verdict is recomputed per-turn from scratch) | High | 1 |
| Scenario context | | ✅ (doctor + up to 5 `doctor_visits`, no explicit product/indication/meeting-stage/available-time fields) | | Med | 1 |
| Hidden concerns | | | ✅ (`objections[]`/`objection_notes` are already spoken, nothing separately hidden) | High | 1 |
| Objection library | ✅ (`ObjectionType` 5 types + `ObjectionCategory` 7 categories, `OBJECTION_INSTRUCTIONS`) | | | — | reuse |
| Variable objections | | ✅ (`pickObjectionType()` is uniform random, not persona/history/performance-weighted) | | Med | 1 |
| Difficulty levels | | | ✅ (no difficulty concept in voice-partner or doctors schema) | Med | 1 |
| Real-time spoken role play | ✅ (record→Whisper STT→Claude judge→OpenAI TTS loop, working) | | | — | reuse |
| Interruption/barge-in | | | ✅ (strict turn-taking; no barge-in) | Low | 4+ |
| Arabic support | ✅ (`lang: 'en'|'ar'` threaded through STT/TTS/prompts, i18n.tsx) | | | — | reuse |
| Iraqi Arabic support | | ✅ (prompts say "Modern Standard Arabic" explicitly in `speak/route.ts`; no dialect-specific instruction) | | Med | 1 |
| Arabic-English code switching | | | ✅ (language is pinned per-session, not detected mid-utterance) | Low | later |
| Transcripts | | | ✅ (client resends history in-memory; nothing per-turn persisted server-side — `session-result` stores only aggregate outcome) | **Critical** | 1 |
| Audio metrics | ✅ for colleague roleplay (`roleplay-core.ts` full acoustic+turn-taking engine) | ✅ not applied to AI Doctor sessions at all | | High | 1 |
| Competency scorecards | | ✅ (CLEAR steps hit/missed exist for voice-partner; roleplay side has talk/question/paraphrase/active-listening scores — two disjoint partial scorecards) | | High | 1–2 |
| AI scoring | ✅ (Claude Haiku judge) | | | — | reuse, but restructure |
| Evidence-grounded scoring | | | ✅ (judge verdict has no transcript-timestamp evidence attached, nothing persisted to point back to) | High | 2 |
| Immediate feedback | ✅ (doctor reply + clearSteps returned per turn) | | | — | reuse |
| Critical Moments | | | ✅ (no timestamps captured; transcript not persisted) | High | 2 |
| Physician/rep Adaptation Score | | | ✅ (no such metric) | High | 3 |
| Pressure Shift | | | ✅ (no before/after windowing; no acoustic capture on AI Doctor turns) | High | 4 |
| Behavioral Gravity | | ✅ (`roleplay-aggregate.ts` computes cross-session trend direction/magnitude per metric — the substrate exists) | ✅ no trigger→response→consequence structure yet | High | 5 |
| Unused Resource Detector | | | ✅ (no per-context capability comparison) | Med | 5 |
| Cognitive-pattern signals | ✅ static bias-per-category map (`cognitive-biases.ts`) | | ✅ not evidence-linked, no confidence levels | Med | 5 |
| Mastermind Coach | | | ✅ (no structured Observation→Evidence→Pattern→Impact→Alternative→Experiment output anywhere) | High | 6 |
| Personalized re-practice | | ✅ (`coaching-queue.ts` suggests a level; not scenario/trigger-targeted) | | Med | 6 |
| Readiness | | | ✅ (no readiness concept/table) | Med | 7 |
| Behavioral Evolution | | ✅ (`roleplay-aggregate.ts` trend logic — real but scoped to 5 roleplay metrics only, not AI-Doctor sessions or coaching-target tracking) | | High | 7 |
| Manager analytics | ✅ (`CoachingQueuePanel`, `SkillHeatmap`, `TeamPulse`, `Leaderboard`, `VoicePracticePanel`) | | | — | reuse |
| Admin scenario builder | ✅ (`ScenarioEditorPanel` + `company-scenarios.ts`, draft/approved/archived workflow) | | | — | reuse |
| Medical/compliance grounding | ✅ (hard SYSTEM-prompt guardrails against invented clinical data/branded drugs in both `generate-scenario` and `voice-partner-core`) | | ✅ no configurable compliance-flag system, no RAG/approved-source retrieval | Med | later |

## Reading this table

The two biggest "Existing but disconnected" assets are:
1. **`roleplay-core.ts`'s acoustic/turn-taking engine** — this IS most of `ConversationObserver` already built and tested, just wired only to the human-colleague path.
2. **`roleplay-aggregate.ts`'s trend computation** — this IS the seed of `Behavioral Evolution`, just scoped to 5 metrics and not yet trigger-aware.

Phase 1 should extend both onto the AI Doctor path rather than building parallel new systems.
