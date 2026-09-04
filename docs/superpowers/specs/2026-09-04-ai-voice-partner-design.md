# AI Voice Partner — Design

## Purpose

Rehearse today has three doctor-scoped practice modes: a warm-up drill,
an AI-generated multiple-choice objection drill (`GeneratedDrill`), and
a one-off live colleague roleplay (Perform). All three either need a
second human in the room or reduce the rep's response to picking from
three pre-written options.

The single biggest adoption barrier to solo practice is needing another
person on the spot. This spec adds a fourth mode — **AI Voice
Partner** — where the rep speaks their own words out loud and an LLM,
voiced as the saved doctor persona, replies in character, adapting its
resistance turn by turn. It's the difference between rehearsing a
script and rehearsing the skill.

Deferred from the 2026-09-03 colleague-roleplay spec, which explicitly
called this "a materially bigger build — a real-time voice AI loop, not
a data-model extension" and left room for it without blocking. This
spec is that build.

**Out of scope for this spec (see "Explicitly not built here"):**
true realtime/streaming voice, barge-in, persisted in-progress
sessions, Arabic deferred to a fast-follow if Whisper/TTS quality on
Iraqi dialect proves weak in testing (v1 ships bilingual per the
existing `lang` pattern, but Arabic voice quality is unverified until
built).

## Interaction model

Turn-based, not streaming. Reuses the shape already proven in
`generate-scenario` (LLM call with a doctor-persona system prompt) and
`useRoleplayRecorder` (mic capture via `MediaRecorder`), rather than
introducing WebSocket/WebRTC infrastructure this stack doesn't have yet.

1. AI opens in character with the objection (same `crisis` framing
   `generate-scenario` already produces), rendered as text and read
   aloud via TTS.
2. Rep taps mic, speaks a free-form reply, releases.
3. Client sends the audio clip + running turn history to
   `/api/voice-partner/turn`. Server does STT → LLM judge-and-reply →
   TTS in one round trip, returns the doctor's next line (text + audio)
   plus a verdict.
4. Client plays the audio, shows the transcript bubble, loops to step 2.
5. Ends on `won`, or on hitting the 5-rep-turn cap without a win
   (`escalated`) — mirrors a doctor walking away.

No session state lives server-side between turns — each request
resends the full (short, text-only) history, same statelessness as a
normal chat completion. This keeps the route simple and means a lost
connection mid-conversation just means the rep restarts (see Out of
scope).

## Vendor / stack

STT: OpenAI Whisper (`/api/transcribe` already exists behind
`TRANSCRIPTION_ENABLED`; this feature calls the same upstream directly
rather than round-tripping through that route, since STT here is one
step inside a larger server-side call, not a standalone client action).
LLM: Claude Haiku via Anthropic, same as `generate-scenario`. TTS:
OpenAI TTS (`gpt-4o-mini-tts` or current equivalent) — one new vendor
call, no new vendor account (uses the existing `OPENAI_API_KEY`).

New feature flag: `AI_VOICE_PARTNER_ENABLED`, same 503
`{error:'not_configured'}` pattern as `transcribe` and
`generate-scenario`. Requires `AI_VOICE_PARTNER_ENABLED=true` +
`ANTHROPIC_API_KEY` + `OPENAI_API_KEY` all set. Ships off by default,
same "Premium · Coming soon" teaser pattern `VisitPrep.tsx`'s
`state === 'notconfigured'` branch already renders for the AI drill.

## Persona + guardrail

Reuses `generate-scenario`'s `SYSTEM` prompt hard rules verbatim (never
invent clinical data/figures/drug names; refer to the product only as
"your product"; coach communication style, not medical claims; output
constrained format only) plus the doctor's `style`, `key_phrases`,
`objections`, and last-5-`doctor_visits` history context via the
existing `buildHistoryContext` helper — same inputs `generate-scenario`
already assembles, no new doctor-context plumbing needed.

Extended with turn-loop-specific rules: stay in character as the
doctor for every reply; adjust resistance based on the actual quality
of the rep's argument (don't concede on a weak reply, don't stonewall
a strong one); never break character to explain the score; when
judging, return a structured verdict alongside the in-character reply
rather than mixing commentary into the spoken line.

## API route

`POST /api/voice-partner/turn`

Auth-gated (existing `createClient()` + `getUser()` pattern). Body:

```ts
{
  doctorId: string
  lang: 'en' | 'ar'
  history: { role: 'doctor' | 'rep'; text: string }[]  // prior turns, text only
  audio: string  // base64, this turn's rep reply
}
```

Server sequence: Whisper-transcribe `audio` → build judge prompt from
`history` + new rep line + doctor persona/guardrail → single Claude
call returns `{ verdict: 'win' | 'escalate' | 'continue', doctorReply: string }`
→ OpenAI TTS on `doctorReply` (voice/language keyed off `lang`, same
per-language branching `generate-scenario` already does for text) →
respond:

```ts
{
  repText: string        // Whisper transcript, shown in the bubble UI
  doctorText: string
  doctorAudio: string    // base64 audio for the client <audio> element
  verdict: 'win' | 'escalate' | 'continue'
}
```

`continue` means resistance persists — client increments the turn
counter and loops; `win`/`escalate` end the session (escalate also
fires automatically when the client-side turn counter hits 5,
independent of the model's verdict, as a hard cap).

## Client

New `useVoicePartner.ts` hook: `idle → recording → sending → playing →
idle` state machine. Captures via `getUserMedia` + `MediaRecorder` —
the same primitive `useRoleplayRecorder` uses, but without that hook's
pitch-autocorrelation/silence-tracking/diarization machinery (single
speaker per clip, no diarization needed here). Holds `history` in
component state across turns; nothing persisted until resolution.

New `VoicePartner.tsx` component, doctor-detail 3rd mode alongside
`WarmUp` and `GeneratedDrill` (not a replacement for either — see
brainstorm decision). Renders: doctor avatar + name/style header (same
visual shell `GeneratedDrill` uses), a scrolling transcript of
alternating bubbles (doctor lines from `doctorText`, rep lines from
`repText`), a mic button cycling through the hook's states, an
`<audio autoPlay>` element for each `doctorAudio` reply, and a turn
counter (`n / 5`). On resolution, shows the same win/escalate
`Feedback` component `GeneratedDrill` already uses, then logs and
calls `onDone(won)`.

## Persistence

No new table. On resolution, one `doctor_visits` insert — same
`addVisit` call site pattern as `GeneratedDrill`'s `onDone` handler in
`VisitPrep.tsx:412-419`:

```ts
addVisit({
  source: 'voice_partner',
  objection_raised: firstDoctorLine,
  note: t('visit.voicePartnerNote', { turns: turnCount, outcome: won ? t('visit.aiDrillWin') : t('visit.aiDrillEscalate') }),
})
```

`DoctorVisit['source']` union in `src/types/game.ts:96` extends to
`'manual' | 'warmup' | 'ai_drill' | 'voice_partner'`.
`SOURCE_LABEL_KEY` in `VisitPrep.tsx:449` gets a matching
`voice_partner: 'visit.sourceVoicePartner'` entry.

XP: new `XP_VALUES.voicePartnerWin` (proposed `40`, matching
`roleplayComplete` — free-speech practice is closer in effort to a
live roleplay than to picking from three options, which is why
`ai_drill` currently awards none). Awarded only on `won`, applied the
same way `useRoleplayRecorder.pickSpeaker` bumps `profiles.xp` today
(read-then-update, not atomic — matches existing pattern, not a
regression this spec introduces).

## Language

`lang` param mirrors `generate-scenario`'s existing `'en' | 'ar'`
handling exactly: Whisper gets a language hint, Claude's system+user
prompts request output in that language, TTS picks voice/instructions
per language. Arabic voice quality (dialect handling, pronunciation of
pharma terms) is unverified until built — if OpenAI TTS Arabic proves
weak in manual testing, fall back to English-only voice with Arabic
text/UI as a scoped-down v1.1, not a blocker for shipping v1.

## Error handling

Mic permission denied → same `error:'mic'` state
`useRoleplayRecorder.start` already uses. STT/LLM/TTS upstream failure
on any turn → generic `upstream` error surfaced on that turn only; the
client-held `history` is untouched, so the rep retries the same turn
without losing the conversation. No partial-turn writes to
`doctor_visits` — only the final resolved outcome is persisted, same
as `GeneratedDrill` today (nothing is logged until `onDone` fires).

## Testing

Pure-function unit tests (vitest, matching `roleplay-core.test.ts` /
`champions-core.test.ts` style) for the turn-cap/verdict state machine
— given a sequence of verdicts, does it resolve `won`/`escalated` at
the right turn, does the hard cap override a model that keeps
returning `continue`. Manual browser verification: full mic → Whisper
→ Claude → TTS round trip in both languages; confirm guardrail holds
(spot-check several generated doctor replies for invented clinical
claims); confirm `doctor_visits` row + XP land correctly on a win;
confirm the "coming soon" teaser renders correctly with the flag off
before flipping it on.

## Explicitly not built here

- True realtime/streaming voice (continuous mic, AI interrupts live) —
  a different infrastructure class; turn-based ships the value (solo
  practice, no second person needed) without it.
- Persisted in-progress sessions — a lost connection mid-conversation
  means the rep restarts. Add resumability only if reps hit this in
  practice.
- Voice selection UI — one fixed voice per language for v1. Per-style
  or per-gender doctor voices are a fast-follow if requested.
- Territory/company-wide analytics on voice-partner sessions — this
  spec logs to `doctor_visits` like the other private prep tools;
  manager-facing rollups are out of scope (see roadmap item #08,
  separate spec if pursued).
- Real-visit debrief (roadmap item #06) — different feature, uses this
  spec's TTS/guardrail patterns not at all; not implied or unblocked by
  this work beyond both existing in the same app.
