# AI Doctor — Phase 0 Audit

Date: 2026-09-11. Scope: read-only inspection of `styleshift-app` (Next.js 16 / React 19 / Supabase / Netlify), HEAD `466a547` on `main`. No production code touched.

## 1. Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind 4. i18n via `src/lib/i18n.tsx` (EN/AR, RTL).
- **Backend:** Next.js route handlers under `src/app/api/**`, no separate server.
- **DB/Auth:** Supabase Postgres + `@supabase/ssr`. Auth is mobile+PIN for reps (`rep-login`, `rep-join`, `rep-signup` routes — replaced SMS OTP per `466a547`), Supabase Auth (email) for managers.
- **AI providers:** Anthropic (`ANTHROPIC_API_KEY`, model `claude-haiku-4-5-20251001` — used for the AI-doctor judge and the generate-scenario drill) and OpenAI (`OPENAI_API_KEY` — Whisper `whisper-1` for STT, `gpt-4o-mini-tts` voice `onyx` for TTS). AssemblyAI (`ASSEMBLYAI_API_KEY`, set only in Netlify, not `.env.local`) does speaker-diarization for the human-colleague roleplay recorder via `netlify/functions/assemblyai-proxy.js`.
- **Feature flags:** `AI_VOICE_PARTNER_ENABLED=true` (live). `AI_DRILLS_ENABLED` — not set in `.env.local` → the `generate-scenario` AI drill is a "coming soon" teaser in this environment.
- **Tests:** Vitest, 19 `*.test.ts` files colocated in `src/lib`, run via `npm test`. CI: `.github/workflows/ci.yml`, `.github/workflows/smoke-deployed.yml`.
- **Deploy:** Netlify (`.netlify/`, `netlify/functions/`), no `netlify.toml` at root — build settings live in the Netlify UI/site config, not in-repo.

## 2. The two AI-Doctor-shaped systems (this is the central Phase 0 finding)

There are **two independent simulation paths** with no shared engine:

### A. "Voice Partner" — the actual AI Doctor
Files: `src/lib/voice-partner-core.ts`, `doctor-context.ts`, API routes `src/app/api/voice-partner/{open,turn,speak}/route.ts` plus per-mode variants (`opening-statement`, `closing-statement`, `fab-statement`, `question-drill/*`) and matching `*-session-result` routes.

Flow per turn (`turn/route.ts`):
1. Client posts audio + client-resent conversation history (JSON, never persisted turn-by-turn) + `objectionType`.
2. Server transcribes via OpenAI Whisper (`transcribeAudio`, language pinned from session).
3. Server builds ONE prompt (`buildJudgePrompt`) combining: doctor persona (`personaLines`), specialty flavor text, objection-type behavioral instructions, full transcript, and CLEAR-step definitions.
4. ONE Claude Haiku call returns JSON: `{ verdict: win|escalate|continue, doctorReply, clearSteps[] }`.
5. `resolveTurn()` applies a hard `TURN_CAP = 5` override.
6. On session end, only an aggregate row is stored (`voice_partner_sessions`: style, objection_type, outcome, clear_steps_hit[], turn_count) — **no per-turn transcript, no timestamps, no audio persisted.**

Doctor persona today = a flat `Doctor` row (`name, specialty, style, assertiveness, responsiveness, key_phrases, objections[], objection_notes`) plus up to 5 recent `doctor_visits` rows folded into a text blob (`buildHistoryContext`). Style is a single categorical value derived from two binary axes (`social-style.ts`: assertiveness ask/tell × responsiveness controls/emotes), not a weighted 4-way blend.

Sample prompt excerpt (`voice-partner-core.ts`):
```
Hard rules — follow exactly:
- NEVER invent clinical data, efficacy numbers, statistics, trial results, study names, dosages, or real/branded drug names.
- Refer to the product only as "your product"...
- Judge the rep's most recent reply on its own merits...
- Output ONLY a single valid JSON object.
```
and the per-turn instruction: `"win" = the rep's reply resolves your objection convincingly... "escalate" = ...you're done listening... "continue" = ...keep pushing.`

### B. "Roleplay" (colleague-partner practice) — the real ConversationObserver
Files: `src/lib/roleplay-core.ts` (explicitly "ported verbatim from ssm-app's Verbal Mirror... voice-logic.js"), `roleplay-aggregate.ts`, component `RoleplayRecorder.tsx`, migrations `009`–`012`.

This is a **deterministic, non-LLM signal-extraction engine** operating on a diarized recording (AssemblyAI) of the rep + a human colleague:
- Acoustic: WPM, pitch/pitch range, filler/hesitation counts, pace/hesitation/range labels.
- Turn-taking: talk ratio, rapid-turn-switches (interruption proxy), question ratio, open/closed question classification, paraphrase score (content-word overlap with the immediately preceding turn), composite active-listening score (0–100).
- `classifySocialStyle()` infers the REP's own social style from their acoustic signature (pace+fluency → assertiveness; pitch range+warmth → responsiveness).
- `roleplay-aggregate.ts` already computes multi-session averages and a single most-notable trend (`improving`/`declining`) per metric — this is longitudinal tracking, just not yet wired to the AI Doctor path or to trigger→response→consequence pattern detection.

**These two systems never talk to each other.** The AI Doctor conversation has no acoustic capture and no persisted transcript; the acoustic ConversationObserver has no AI doctor and no objection-type/persona model.

## 3. Data model (as it actually exists — from `supabase/migrations/001`–`025`)

Key tables (abbreviated):
- `companies`, `profiles` (rep/manager, role, xp, company_id)
- `doctors` (Digital Twin persona — see §2A), `doctor_visits` (source enum includes `manual|warmup|ai_drill|voice_partner|voice_partner_opening|voice_partner_question|voice_partner_fab|voice_partner_closing`; objection_raised/promise_made/what_worked/note)
- `roleplay_sessions` (009) + coaching-metrics columns added in 012: `talk_ratio, rapid_turn_switches, question_ratio, rep_style, rep_confidence, rep_metrics jsonb, open_question_ratio, paraphrase_score, active_listening_score`
- `voice_partner_sessions` (014) and per-mode variants (015–018: opening/question/fab/closing sessions) — aggregate outcome rows only, style/objection_type/outcome/clear_steps_hit/turn_count
- `colleagues` (013 — deliberately minimal, "a practice partner's identity, not a prep target")
- `company_scenarios` (024–025) — manager-authored scenario drafts with `status: draft|approved|archived`, `approved_by`
- `groups`, `leagues`, `assignments`, `assignment_replies`, `voice_events`, `invite_events`, `xp_events`, `badges` — gamification/ops layer

No `physician_state`, `hidden_concerns`, `critical_moments`, `pressure_shifts`, `adaptation_scores`, `behavior_patterns`, `coaching_reports`, `readiness_records`, or `evolution_metrics` tables exist.

## 4. Manager/admin surface (already exists)

`src/components/dashboard/`: `ScenarioEditorPanel.tsx` (admin scenario builder — writes to `company_scenarios` via `company-scenarios.ts`, with `validateScenarioInput` requiring a real `ObjectionCategory` from `social-style.ts`'s 7-category list: evidence/price/safety/time/competitor/logistics/trust), `CoachingQueuePanel.tsx` + `CoachingQueueAndAssign.tsx` (built from `coaching-queue.ts` — flags: `low_accuracy|inactive|assignment_overdue|no_voice_practice`, ranked, max 6 entries), `SkillHeatmap.tsx`, `TeamPulse.tsx`, `VoicePracticePanel.tsx`, `Leaderboard.tsx`, `LeagueBoardPanel.tsx`, `RecognitionCard.tsx`.

## 5. Cognitive-bias / objection taxonomy (already exists, currently static)

`src/lib/social-style.ts` defines 7 `ObjectionCategory` values (evidence, price, safety, time, competitor, logistics, trust). `src/lib/cognitive-biases.ts` maps each category to ONE fixed doctor-side cognitive bias (e.g. price→anchoring, evidence→confirmation, safety→availability). This is a static 1:1 lookup, not evidence-linked or confidence-scored, and lives in the "objection drills" (company-scenario) path — separate from the voice-partner's own 5-type `ObjectionType` enum (`wrong_info|doubt|true_objection|indifference|false_objection`), which is a different, unconnected taxonomy.

## 6. What "Verbal Mirror" means in this codebase

There is no in-app feature literally named "Verbal Mirror" in StyleShift. It is the name of the acoustic-scoring engine in the sibling app `ssm-app` that `roleplay-core.ts` ports from (see file header comment). The plan doc `docs/superpowers/plans/2026-09-01-roleplay-verbal-mirror.md` documents that port.

## 7. Existing prior-art docs

`docs/superpowers/plans/` and `docs/superpowers/specs/` already hold 14 shipped-feature design docs (voice partner modes, colleague roleplay, coaching metrics, objection CLEAR model, company scenarios, cross-team leagues, etc.) — useful precedent for how this team writes specs; Phase 1 plan follows the same shape.
