# Realtime Voice Partner — Client Integration Design

**Date:** 2026-09-18
**Status:** Approved, ready for implementation plan

## Context

The turn-based Voice Partner has 5 modes (objection, opening, question drill,
FAB, closing), each doing STT → Claude judge → TTS per exchange. Server-side
plumbing for a **realtime** alternative already exists and is deployed:

- `src/app/api/pipecat/session/route.ts` — authenticated, verifies doctor
  ownership, forwards scenario body to Pipecat Cloud's public REST start
  endpoint, returns a Daily room.
- `pipecat-agent/` — Pipecat Cloud agent `styleshift-voice-partner`,
  dual-provider (`live_provider.py`: Gemini Live default, GPT-Live via
  `LIVE_PROVIDER=openai`), deployed to org `respective-krill-blue-655`.
- Netlify production has `PIPECAT_AGENT_NAME` + `PIPECAT_CLOUD_PUBLIC_KEY` set.

**What's missing, and what this spec covers:** there is zero frontend
integration. No `@pipecat-ai/*` client package is installed, and nothing in
`VisitPrep.tsx`/`useVoicePartner.ts` calls `/api/pipecat/session`. A rep
cannot start one of these calls today.

This corrects a stale project-memory note that claimed this work was mostly
done except for a deploy step — verified false by grepping the actual
codebase before starting this design.

## Decisions (confirmed with Shadi)

1. **Coexistence:** new 6th practice mode, opt-in. Does not touch or replace
   any of the 5 existing turn-based modes.
2. **Client SDK:** `@pipecat-ai/client-js` + Daily transport — matches the
   already-deployed `bot.py`/RTVI server stack, not raw `daily-js`.
3. **Provider selection:** backend-only (`LIVE_PROVIDER` env on the Pipecat
   agent). Not exposed in the rep-facing UI.
4. **Post-call scoring:** yes — same standard as the 5 existing modes
   (`voice_partner_sessions` row + XP), via post-call transcript analysis,
   not per-turn scoring during the call (the live model doesn't produce
   discrete judged turns) and not scoring split into `bot.py`.

## Architecture

Three new pieces, no changes to the 5 existing turn-based components/hooks:

- **`useVoiceLive.ts`** (new hook) — wraps `@pipecat-ai/client-js` + Daily
  transport. Calls the existing, unchanged `/api/pipecat/session` to get a
  Daily room, joins it, exposes connection state
  (`idle | connecting | live | ended | error`), and accumulates a transcript
  array from RTVI transcription events (both rep and bot sides).
- **`VoicePartnerLive.tsx`** (new component) — new
  `{ mode: 'voiceLive'; doctor: Doctor }` case added to `VisitPrep.tsx`'s
  existing view-union pattern (see `View` type, `src/components/game/VisitPrep.tsx`
  lines ~38-51), next to the 5 other mode buttons on a doctor's detail view.
  Live-call UI: connect screen (difficulty picker, matches existing modes'
  pattern) → live-call controls (mute, end call, countdown) → existing
  result screen (reused, not rebuilt).
- **`/api/voice-partner/live-judge`** (new route) — the **only** new
  server-side piece. Takes the full transcript + `doctorId` + `difficulty`,
  runs **one** Claude judge call over the whole conversation (adapts
  `voice-partner-core.ts`'s existing per-turn judge-prompt shape to a
  full-transcript input), and returns
  `{ objectionType, outcome, clearSteps, turnCount }` — the exact input
  shape `/api/voice-partner/session-result` already expects. Also backfills
  `conversation_turns` rows parsed from the transcript, matching what
  `turn/route.ts` and `open/route.ts` already insert per exchange, so Phase
  2-6 deep analysis (session-evaluator, pressure-shift, behavioral-gravity,
  mastermind-coach) keeps working on this mode's sessions too — no schema
  change, just a different population path.

**Explicitly not built new:** `doctor_visits` insert. Verified against the
actual turn-based implementation (`useVoicePartner.ts` lines 81-104,
`session-result/route.ts`) that voice-partner sessions only ever write
`voice_partner_sessions` + a client-side `profiles.xp` bump — `doctor_visits`
is a separate free-text visit log used by manual/warmup/ai_drill sources
only. This feature matches the real existing pattern, not the one first
assumed during design (caught and corrected before writing this doc).

## Data flow

1. Rep taps "Live Voice Practice" on a doctor's detail view → `VoicePartnerLive`
   mounts, shows connect screen (difficulty picker).
2. On connect: `useVoiceLive` calls `POST /api/pipecat/session` (existing,
   unchanged) with `doctorId`/`lang`/`difficulty` → gets back Daily room URL
   + token.
3. Client joins via Pipecat client-js. Bot greets in character (already
   deployed). RTVI transcription frames stream in both directions; hook
   appends each to an in-memory transcript array
   (`{ role: 'doctor' | 'rep'; text: string; ts: number }[]`).
   `bot.py` already enforces its own turn/time cap server-side; client
   mirrors it for a UI countdown only, doesn't re-enforce it.
4. Rep ends the call (or bot hits its cap) → hook disconnects from Daily,
   transitions to `ended`.
5. `VoicePartnerLive` POSTs the transcript to `/api/voice-partner/live-judge`
   with `doctorId`/`difficulty`.
6. Route runs the one-shot judge, returns
   `{ objectionType, outcome, clearSteps, turnCount }`.
7. Client calls the existing `awardXpOnWin()` pattern (if `outcome === 'won'`)
   and the existing, unchanged `/api/voice-partner/session-result` with the
   judge's output — reusing both exactly as the 5 turn-based modes do today.
8. Client shows the existing result screen (win/escalate, XP earned) — reused,
   not rebuilt.

## Error handling

- **Mic permission denied** — Pipecat client-js emits a connection/mic error
  event; surface a real error state. (Contrast with the known gap in
  `useAudioRecorder.ts`, which silently swallows `getUserMedia` denial —
  don't repeat that here.)
- **Daily room join failure / Pipecat Cloud unreachable** — `/api/pipecat/session`
  already returns `pipecat_unreachable`/`pipecat_start_failed`; client shows
  retry, no session saved.
- **Disconnect mid-call** — transcript-so-far still POSTed to `live-judge` if
  it has ≥1 rep turn. Near-empty transcript (0 rep turns) → skip the judge
  call entirely, return to doctor detail, nothing saved.
- **Judge call fails on `live-judge`** — do not silently drop the completed
  call. Insert a minimal `voice_partner_sessions` row (`turn_count` only, via
  a direct fallback path — `objectionType`/`outcome`/`clearSteps` omitted)
  rather than losing a rep's completed practice entirely; log server-side.
  This is a deliberate small deviation from `session-result`'s existing
  "reject if any field missing" validation, justified because here the
  underlying call already happened — failing to save any record is worse UX
  than an unscored one.

## Feature flag

New `AI_VOICE_PARTNER_LIVE_ENABLED` env var — separate from the existing
`AI_VOICE_PARTNER_ENABLED` (which gates the 5 turn-based modes). Lets this
ship dark independently. The mode button renders only when both this flag
and `PIPECAT_CLOUD_PUBLIC_KEY` are present (mirrors the existing
`AI_DRILLS_ENABLED`-style "coming soon" gating already used elsewhere).

## Testing

- Unit tests (pure functions, same standard as the rest of this codebase):
  transcript → `conversation_turns` parser; full-transcript judge-prompt
  builder; the empty/near-empty-transcript skip rule.
- `live-judge` route: integration test with a mocked Claude call, same
  pattern as existing `session-result`/`session-analysis` route tests.
- `useVoiceLive`: state-machine transitions tested independent of real
  Daily/mic access, same approach already used for
  `useAudioRecorder`/`useRoleplayRecorder`.
- **Known, accepted limitation** (same as already documented for the
  turn-based Voice Partner and Live Roleplay): headless browser automation
  cannot grant mic access, so the actual live-audio round trip (join → speak
  → hear bot → transcript arrives) requires manual QA on the live site after
  implementation — not achievable via the automated test suite.

## i18n

New `voiceLive.*` keys (connect screen, live-call status labels, end-call
button, error states), EN+AR, same naming convention as `voice*`/`roleplay.*`
keys. Given the 2026-09-18 incident where new AR strings were committed as
literal `?` placeholders (caught only by manual diff review, not by tests),
every new AR string here will be visually verified via the Read tool before
commit, not trusted from a generation pass.

## Out of scope (this pass)

- Migrating any of the 5 existing turn-based modes to realtime.
- Exposing provider (Gemini/OpenAI) choice in the UI.
- Acoustic/vocal-delivery signals (Oruk) for the live-call path — Oruk is
  wired into the turn-based recording flow only; realtime audio isn't
  captured as a file the same way.
- Real-time (during-call) visual state for the rep — no in-call transcript
  view, no live scoring hints.
