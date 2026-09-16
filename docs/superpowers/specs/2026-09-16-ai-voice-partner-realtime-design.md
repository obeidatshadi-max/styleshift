# AI Voice Partner — Realtime (Pipecat) — Design

## Purpose

The 2026-09-04 AI Voice Partner spec shipped a turn-based loop (tap mic →
Whisper → Claude → TTS → play, repeat) and explicitly deferred "true
realtime/streaming voice, barge-in" as "a different infrastructure class."
This spec is that build.

Turn-based practice teaches the words. It doesn't teach the skill of
holding a live exchange — reading when to jump in, recovering when
interrupted, adjusting tone mid-sentence. A doctor who can be cut off,
who starts replying before the rep finishes, who reacts to hesitation —
that is what makes solo practice feel like the real call instead of a
voice-memo relay. This spec replaces the turn-based AI Voice Partner with
a continuous, interruptible, low-latency voice session, orchestrated by
[Pipecat](https://github.com/pipecat-ai/pipecat).

**Out of scope for this spec:**
- Human colleague Live Roleplay (`RoleplayRecorder`, Perform pillar) —
  unrelated system, untouched by this work.
- Territory/manager analytics on voice-partner sessions (existing spec's
  deferral still holds).
- Real-visit debrief (roadmap item #06) — unrelated.
- Voice selection UI — one fixed ElevenLabs voice per language for v1,
  same deferral as the turn-based spec.

## Why replace, not add alongside

The turn-based version ships a real but limited experience under the same
feature flag and UI slot (`VoicePartner.tsx`, doctor-detail 3rd mode). A
second parallel voice system would mean two STT/TTS vendor integrations,
two error-handling paths, and two things to keep in sync with
`generate-scenario`'s persona/guardrail prompt for no user benefit — reps
get one "AI Voice Partner" entry point, not a choice between "basic" and
"advanced" versions of the same feature. The realtime build takes over the
slot once it's verified working; the turn-based code is removed, not kept
as a fallback (no dual-maintenance burden, and Pipecat Cloud's SLA is the
availability fallback, not a slower local mode).

## Architecture

```
Browser (Daily JS SDK)
  ── WebRTC audio ──▶  Daily room
                          │
                          ▼
                    Pipecat Cloud bot session
              ┌─────────────────────────────────┐
              │ DailyTransport (in/out audio)    │
              │   → Deepgram streaming STT       │
              │   → Claude Haiku (Anthropic)     │
              │       persona + guardrail prompt │
              │       + resolve_session tool     │
              │   → ElevenLabs streaming TTS     │
              │   → DailyTransport (out audio)   │
              │ RTVI data channel (transcript,    │
              │   verdict/tool-call events)      │
              └─────────────────────────────────┘
                          │
                          ▼
         Next.js API routes (session create / resolve)
                          │
                          ▼
                     Supabase (doctor_visits)
```

Turn-based's stateless-per-request model doesn't apply here — a Pipecat
Cloud bot session is a live process for the duration of the practice
session (auth-gated at creation, torn down on resolution or timeout).

## Vendor / stack

- **Transport:** Daily (WebRTC), via Pipecat Cloud's native integration.
  New account/API key (`DAILY_API_KEY`), used only for realtime rooms —
  not related to anything else in the stack.
- **STT:** Deepgram streaming (`DEEPGRAM_API_KEY`) — replaces OpenAI
  Whisper for this feature only; `/api/transcribe` (used elsewhere) is
  untouched.
- **LLM:** Claude Haiku via Anthropic — same vendor, same model tier as
  `generate-scenario` and the turn-based voice partner.
- **TTS:** ElevenLabs streaming (`ELEVENLABS_API_KEY`) — replaces OpenAI
  TTS for this feature only, for prosody/emotion and per-language voice
  quality (including Arabic, still unverified until built — same
  fallback-to-English-only-voice escape hatch as the turn-based spec if
  quality proves weak in testing).
- **Hosting:** Pipecat Cloud (`PIPECAT_CLOUD_API_KEY`) runs the bot
  process — no persistent server for this app to operate; Netlify stays
  Next.js-only.

New feature flag: `AI_VOICE_PARTNER_ENABLED` (reused, not renamed — it's
the same user-facing feature, just rebuilt). Requires
`AI_VOICE_PARTNER_ENABLED=true` + `ANTHROPIC_API_KEY` +
`DAILY_API_KEY` + `DEEPGRAM_API_KEY` + `ELEVENLABS_API_KEY` +
`PIPECAT_CLOUD_API_KEY`. Same 503 `{error:'not_configured'}` /
"Premium · Coming soon" teaser pattern as before when unset.

## Persona + guardrail

Same `generate-scenario` `SYSTEM` prompt hard rules verbatim (never
invent clinical data/figures/drug names; refer to the product only as
"your product"; coach communication style, not medical claims) plus the
doctor's `style`, `key_phrases`, `objections`, and last-5-`doctor_visits`
history via the existing `buildHistoryContext` helper — unchanged inputs,
injected into the Pipecat bot's LLM service config at session creation
instead of into a per-request judge prompt.

Extended with the same turn-loop rules as the turn-based spec (stay in
character, adjust resistance to argument quality, never break character
to narrate score) plus one new rule for the tool: call `resolve_session`
with `verdict: 'win' | 'escalate'` when the exchange reaches a natural
conclusion — a clear concession or a clear doctor walk-away — not on a
fixed turn count. The 5-turn hard cap (tracked server-side from
transcript events, not client-side) still forces `escalate` if the model
never resolves.

## API routes

**`POST /api/voice-partner/session`** — auth-gated (existing
`createClient()` + `getUser()`). Body: `{ doctorId, lang }`. Server
builds the persona/guardrail prompt (same inputs as today), creates a
Daily room + Pipecat Cloud bot session with that prompt and the
`resolve_session` tool definition, returns:

```ts
{ roomUrl: string; token: string; sessionId: string }
```

**`POST /api/voice-partner/resolve`** — called once by the client when
the bot's `resolve_session` tool-call event arrives (or the 5-turn cap
fires). Body: `{ sessionId, doctorId, verdict, transcript, turnCount }`.
Does the same `doctor_visits` insert + XP award the turn-based version
did on `onDone`, then instructs Pipecat Cloud to tear down the bot
session. Centralizing the write here (not client-direct-to-Supabase)
keeps the same server-validates-the-outcome shape the turn-based route
had, rather than trusting the client with the win/escalate write.

## Client

`useVoicePartner.ts` rewritten around `@daily-co/daily-js`:
`idle → connecting → live → resolving → idle` state machine. `live`
covers the whole continuous conversation, not one turn — mic is always
open once connected (Daily handles the actual streaming; the hook tracks
connection state, the running transcript from RTVI data-channel events,
and turn count for the client-visible counter).

`VoicePartner.tsx` keeps the same visual shell (doctor avatar/header,
scrolling transcript bubbles, turn counter, win/escalate `Feedback`
component, `onDone` call) — the realtime backend is invisible in the UI
except: no more discrete mic-tap button (replaced by a single
join/leave call control, since the mic is continuously live), and the
doctor's TTS audio can now be interrupted (Daily/Pipecat handles ducking
the bot's audio out when the rep's VAD triggers mid-reply).

## Persistence

Same as turn-based: one `doctor_visits` insert on resolution, no new
table, same `DoctorVisit['source']` value (`'voice_partner'` — no new
enum member, this is the same feature). Same `XP_VALUES.voicePartnerWin`
(`40`), awarded only on `won`, only from `/api/voice-partner/resolve` (not
client-side) now that resolution is server-confirmed.

## Language

Same `lang: 'en' | 'ar'` pattern as `generate-scenario`. Deepgram and
ElevenLabs both take a language parameter at session-creation time,
keyed off `lang`, same per-language branching shape the turn-based spec
used. Arabic voice quality (Iraqi dialect handling via ElevenLabs) is
unverified until built — if it proves weak in manual testing, fall back
to English-only voice with Arabic text/UI, same scoped-down v1.1 escape
hatch as before, not a blocker for shipping v1.

## Error handling

- Daily room/bot session creation fails → same `error:'upstream'`
  pattern the turn-based spec used for STT/LLM/TTS failures, surfaced
  before the rep ever joins (no partial session).
- Mic/room permission denied → same `error:'mic'` state
  `useRoleplayRecorder.start` already uses.
- Bot disconnects or crashes mid-session → client shows a reconnect
  prompt; if reconnect fails, the rep restarts fresh (matches the
  turn-based spec's "lost connection mid-conversation means the rep
  restarts" — still out of scope to persist in-progress sessions).
- No partial-turn writes to `doctor_visits` — only `/api/voice-partner/resolve`
  writes, and only once, same as before.

## Testing

Pure-function unit tests (vitest) for the server-side turn-cap/verdict
logic in `/api/voice-partner/resolve` (given a verdict + turn count, does
it resolve correctly, does the hard cap override an unresolved session) —
same shape as the turn-based spec's tests, adapted for the new resolve
route instead of the old per-turn route.

Manual browser verification (the realtime pipeline itself isn't
unit-testable): full Daily join → live conversation → barge-in works
(interrupt the doctor mid-line, doctor's audio actually stops) → natural
resolution via tool-call → hard-cap escalate path → both languages →
guardrail spot-check (no invented clinical claims across several
sessions) → `doctor_visits` row + XP land correctly → "coming soon"
teaser renders with the flag off.

Use the `pipecat-context-hub` MCP server during implementation to pull
current Pipecat API reference (transport setup, Anthropic LLM service
function-calling shape, RTVI transcript events) rather than relying on
training-data API shape, which drifts as Pipecat ships releases.

## Explicitly not built here

- Persisted in-progress sessions (reconnect resumes state) — add only if
  reps hit disconnects in practice.
- Voice selection UI — one fixed voice per language, per-style/gender
  voices are a fast-follow if requested.
- Territory/manager analytics on voice-partner sessions — unchanged
  deferral from the turn-based spec.
- Migrating any other feature (colleague Live Roleplay, transcribe route)
  off their current vendors — this spec only touches AI Voice Partner.
