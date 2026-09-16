# AI Doctor — Architecture

This is the current, as-built architecture of StyleShift's "AI Doctor" voice-partner
feature: a rep practices handling an objection against an AI physician built from the
rep's own Digital Twin doctor profile. It covers both the shipped text-based path and
the realtime voice path on `feat/ai-voice-partner-realtime`.

For the phased build history, see `docs/ai-doctor-phase-1-plan.md` (Phases 1-4),
`docs/ai-doctor-gap-analysis.md`, and `docs/ai-doctor-audit.md`. This document
describes where those phases landed, plus the additions from
`docs/superpowers/plans/2026-09-16-ai-doctor-realtime-hardening.md` (real speech
timing, evaluator signal surfacing, Replay-This-Moment).

## Two paths, one evidence store, one evaluator

There are two ways a rep can run an AI Doctor session:

1. **Text-based** (shipped): the client records short audio clips, uploads them to
   `/api/voice-partner/turn`, which transcribes via Whisper and calls the judge LLM.
2. **Realtime voice** (`feat/ai-voice-partner-realtime`, Pipecat Cloud + Daily + Deepgram
   STT + ElevenLabs TTS): `pipecat-bot/bot.py` runs a live full-duplex call, but calls
   the exact same `/api/voice-partner/turn` route for every exchange — all persona,
   guardrail, and judge logic lives in one place regardless of transport.

Both paths write to the same `conversation_turns` table (migration 026, extended by
migration 030 for realtime timing) and are scored by the same evaluator
(`session-evaluator.ts`). Nothing about the judge, persona, or evaluator differs by
path — only how a rep's turn reaches the server differs.

## DoctorAgent / Evaluator separation

The spec principle "don't let the doctor score itself while acting as the doctor" is
already structural, not a convention to remember:

- **DoctorAgent** = the judge call in `voice-partner-core.ts`'s `buildJudgePrompt` /
  `parseJudgeResponse`, invoked from `turn/route.ts` on every exchange. It returns an
  in-character reaction (`personaState: resistant | satisfied | disengaged`), never a
  score. `resolveTurn()` — a separate, deterministic function — is what turns that
  reaction into a pedagogical outcome (`won` / `escalated` / `continue`).
- **Evaluator** = `session-evaluator.ts`'s competency/adaptation scoring, invoked only
  from `/api/voice-partner/session-analysis`, a completely separate route the client
  calls after the session ends. Per that file's own header comment: "Single post-session
  LLM call ... never part of the live judge call." It is lazy/on-demand — nothing
  auto-fires it at session end — and grounds every score in `turn_index` references the
  route re-derives from the real persisted transcript, never in a raw LLM quote.

## Persona engine

- **Weighted social style** (`styleWeights`, `styleDescriptor` in `voice-partner-core.ts`):
  a doctor's `style_driver` / `style_expressive` / `style_amiable` / `style_analytical`
  columns (migration 026) blend into a percentage description injected into the judge
  prompt — e.g. "primarily a driver customer in this moment, with a persistent
  underlying blend of 30% analytical...". This is the spec's Driver/Analytical/
  Expressive/Amiable "Social Style Support" section, already implemented.
- **Physician state engine** (`PhysicianState = {trust, skepticism, engagement,
  timePressure}`): seeded per-session from the doctor's style axes + chosen
  `Difficulty` (`supportive | realistic | resistant | pressure_test`), carried
  turn-to-turn by the client, updated by the judge's own `stateDelta` output
  (clamped ±10/turn), and snapshotted onto every `conversation_turns` row. This is the
  spec's hidden `doctorState` — never revealed to the rep, per the SYSTEM prompt's hard
  rule.
- **Hidden concerns / scenario context**: `hidden_concern`, `product_context`,
  `meeting_stage`, `available_time_min` columns shape the prompt further; a hidden
  concern only surfaces once the rep earns a "clarify" CLEAR step.

## Critical Moment engine (Pressure Shift)

`pressure-shift.ts`'s `findPressureMoment` / `computePressureShift` is the spec's
"Critical Moment Engine," v1, text-only: it finds the first doctor turn whose state
snapshot swings against the rep by more than a threshold (`pressureIndex >= 12`,
combining trust/skepticism/engagement/time-pressure deltas), then compares the rep's
questioning/paraphrase behavior in a BEFORE window (last ≤2 rep turns) against an AFTER
window (every rep turn from that point on). Deliberately text-only v1 — real acoustic
capture (pitch/pause) was named as a deferred follow-up in migration 029's header
comment, not faked with placeholder numbers.

## Realtime speech timing (this hardening pass)

The realtime bot now captures real per-turn timestamps instead of relying on
`turn_index` as a timing stand-in:

- `pipecat-bot/bot.py` wires a `VADProcessor(vad_analyzer=SileroVADAnalyzer())` into
  the pipeline (pipecat-ai 1.10.0 removed the old `TransportParams.vad_analyzer`
  field — verified against the tagged source, not assumed). `VADUserStartedSpeakingFrame`
  gives real rep speech-start timing; `BotStartedSpeakingFrame`/`BotStoppedSpeakingFrame`
  (emitted upstream by the transport output, so the judge processor sees them without a
  pipeline-position change) give real doctor speech timing.
- Rep timing rides the existing `/api/voice-partner/turn` POST as `repStartedAt`/
  `repEndedAt`. Doctor timing isn't known until TTS finishes playing — after `/turn`
  already returned — so it's patched via a small best-effort call to
  `/api/voice-partner/turn-timing` once playback ends.
- `conversation_turns.started_at`/`ended_at` (migration 030) are nullable and
  realtime-path-only; every text-based-path row and every existing query is unaffected.
- `src/lib/voice-partner-timing.ts`'s `computeRealtimeSignals` reuses
  `roleplay-core.ts`'s proven `computeTalkRatio`/`computeRapidTurnSwitches` — the same
  functions already scoring the human-colleague roleplay path — rather than
  reimplementing talk-ratio/interruption math. It returns `null` (not fabricated
  zeros) for any session with no real timing, and is surfaced as
  `SessionSignals.realtimeSignals` in the evaluator's output.

## Replay-This-Moment

`/api/voice-partner/replay-context` returns a detected pressure moment's doctor line
and physician-state snapshot; the client re-launches the *existing, unmodified*
`/api/voice-partner/pipecat-session` route seeded with that `openingText`/`state`
instead of a fresh `seedPhysicianState()` call — no new realtime infrastructure, just a
different seed into the same start flow.

## Deploy target

The realtime bot only runs on Pipecat Cloud (Linux containers) — `daily-python` ships
no Windows wheels, so it cannot run locally on a Windows dev machine at all, only in
CI/production or a Linux/WSL/Docker environment. See `docs/AI_DOCTOR_SETUP.md`.
