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

## Correction from initial draft

The first draft of this spec was written from the 2026-09-04 turn-based
spec alone and assumed a plain conversational LLM loop with an invented
`resolve_session` tool-call. The shipped system has grown well past that
doc: a physician-state engine (`trust`/`skepticism`/`engagement`/`timePressure`,
`src/lib/voice-partner-core.ts:170-240`), difficulty levels that seed it,
a CLEAR-step judge that returns structured JSON every turn
(`personaState`/`clearSteps`/`stateDelta`, not free text), a deterministic
`resolveTurn()` that turns `personaState` into win/escalate/continue, a
`conversation_turns` evidence table, weighted objection-type selection
against session history, and hidden-concern reveals gated on CLEAR steps.
None of that is a conversational LLM's job to decide — it is already a
well-tested, deterministic TypeScript layer
(`src/lib/voice-partner-core.test.ts`) sitting in front of one structured
Claude call per turn. Reimplementing it in Python inside the bot, or
replacing it with a tool-call, would fork scoring logic into two places
that drift. This revision keeps 100% of that logic exactly where it is —
Pipecat only replaces the audio I/O and turn-taking layer around it.

## Architecture

```
Browser (Daily JS SDK)
  ── WebRTC audio ──▶  Daily room ◀── WebRTC audio ──  Pipecat Cloud bot
                                                          │
                                          Deepgram streaming STT (VAD/turn-
                                          detection segments rep speech)
                                                          │
                                          repText per completed rep turn
                                                          │
                                                          ▼
                                    POST /api/voice-partner/turn
                                    (existing route, bearer-token auth path
                                     added; repText branch added — see below)
                                                          │
                          buildJudgePrompt → Claude Haiku → parseJudgeResponse
                          → resolveTurn → applyStateDelta → conversation_turns
                                        insert   (ALL UNCHANGED)
                                                          │
                                          { doctorText, outcome, state,
                                            clearSteps }
                                                          ▼
                                          ElevenLabs streaming TTS
                                                          │
                                          spoken back over Daily (interruptible)
                                                          │
                          on outcome !== 'continue': POST /session-result
                          (existing route, same bearer-token auth added)
```

The browser also gets a live transcript via Daily's app-message data
channel: the bot broadcasts `{type:'rep_text'|'doctor_text', text}` and
`{type:'outcome', outcome, state}` events as they happen, which
`useVoicePartner.ts` renders into the same bubble UI — no polling, no
second connection.

Turn-based's stateless-per-request model still applies to `/turn` and
`/session-result` themselves (each call is independent, same as today) —
what's new is a live bot process for the session's duration sitting
between the browser and those routes, rather than the browser calling
them directly.

## Vendor / stack

- **Transport:** Daily (WebRTC) — provisioned automatically by Pipecat
  Cloud's session-start API (`createDailyRoom: true`), not a separate
  Daily developer account. No new Daily API key for this app.
- **STT:** Deepgram streaming — replaces OpenAI Whisper for this feature
  only; `/api/transcribe` (used elsewhere) is untouched. Credential lives
  in the bot's Pipecat Cloud secret set, not this app's environment.
- **LLM:** Claude Haiku via Anthropic — same vendor, same model tier as
  `generate-scenario` and the turn-based voice partner. Still called only
  from Next.js (`/open`, `/turn`) — the bot itself never calls Anthropic.
- **TTS:** ElevenLabs streaming — replaces OpenAI TTS for this feature
  only, for prosody/emotion and per-language voice quality (including
  Arabic, still unverified until built — same fallback-to-English-only-
  voice escape hatch as the turn-based spec if quality proves weak in
  testing). Credential lives in the bot's Pipecat Cloud secret set.
- **Hosting:** Pipecat Cloud runs the bot process — no persistent server
  for this app to operate; Netlify stays Next.js-only. Next.js calls
  `POST https://api.pipecat.daily.co/v1/public/{agent_name}/start` with
  `createDailyRoom: true` and a `body` payload carrying the bot token +
  session context; the response's `dailyRoom`/`dailyToken` are what the
  browser joins with.

Two separate credential surfaces, deliberately: **Next.js/Netlify env**
gets `PIPECAT_CLOUD_API_KEY` (to call the start-session endpoint) and the
new `VOICE_PARTNER_BOT_TOKEN_SECRET`, alongside the existing
`ANTHROPIC_API_KEY`. **Pipecat Cloud's own secret set** (uploaded via
`pipecat cloud secrets set`, never touches Netlify) gets
`DEEPGRAM_API_KEY` + `ELEVENLABS_API_KEY` + the bot-callback base URL —
the bot never needs Supabase or Anthropic credentials at all.

New feature flag: `AI_VOICE_PARTNER_ENABLED` (reused, not renamed — it's
the same user-facing feature, just rebuilt). Requires
`AI_VOICE_PARTNER_ENABLED=true` + `ANTHROPIC_API_KEY` +
`PIPECAT_CLOUD_API_KEY` + `VOICE_PARTNER_BOT_TOKEN_SECRET` in Next.js's
env (the bot's own deploy-time secrets are a separate prerequisite, not
gated by this flag). Same 503 `{error:'not_configured'}` / "Premium ·
Coming soon" teaser pattern as before when unset.

## Persona + guardrail

Unchanged. `SYSTEM`, `personaLines`, `buildOpeningPrompt`,
`buildJudgePrompt` (`src/lib/voice-partner-core.ts`) are not touched by
this spec — they keep running inside `/api/voice-partner/open` and
`/api/voice-partner/turn` exactly as today, called by those routes
instead of by the browser directly. The doctor's `style`, `key_phrases`,
`objections`, weighted persona, hidden concern, scenario context,
physician-state block, and last-5-`doctor_visits` history all keep
flowing through the same functions, same tests.

## Auth bridging (new)

The Pipecat Cloud bot runs as its own server process — it has no
Supabase session cookie, so it can't call the existing cookie-authed
`/open`/`/turn`/`/session-result` routes as the browser does. New
mechanism: a short-lived, session-scoped bearer token.

**`lib/voice-partner-bot-token.ts`** (new): `signBotToken({ userId, doctorId, sessionId })`
returns an HMAC-signed token (via `jose` or Node's `crypto`, using a new
`VOICE_PARTNER_BOT_TOKEN_SECRET` env var) with a 10-minute expiry — long
enough for a full 5-turn session, short enough that a leaked token is
useless soon after. `verifyBotToken(token)` returns the claims or `null`.

**`lib/voice-partner-auth.ts`** (new): `authenticateVoicePartnerRequest(req)`
checks `Authorization: Bearer <token>` first (verifies via
`verifyBotToken`, returns `{ userId, doctorId, sessionId, viaToken: true }`);
falls back to the existing cookie-session check
(`createClient()` + `getUser()`) if no bearer header is present, returning
`{ userId, viaToken: false }`. Existing browser-direct callers (if any
remain, e.g. a non-realtime fallback) keep working unchanged.

Routes authenticated via bearer token can't use the user's RLS-scoped
Supabase client (no session = no RLS context), so they use
`createAdminClient()` (`src/lib/supabase-admin.ts`, existing pattern) for
the DB read/write instead, with the ownership check RLS would have done
made explicit: `.eq('rep_id', userId)` added to every `doctors`/session
query on the bearer-token path.

## API routes

**`POST /api/voice-partner/pipecat-session`** (new) — auth-gated
(existing cookie pattern; browser calls this right after `/open`
resolves, forwarding `/open`'s own response fields). Body:
`{ doctorId, sessionId, lang, openingText, objectionType, state, difficulty }`
— everything the bot needs to keep calling `/turn` itself, since it now
owns the conversation loop the browser used to own (`/turn` requires
`objectionType` and `state` on every call; the bot must carry them
forward the same way `useVoicePartner.ts` did, starting `clearStepsHit`
at `[]`). Server signs a bot token via `signBotToken`, then calls
`POST https://api.pipecat.daily.co/v1/public/{agent_name}/start` with
`createDailyRoom: true` and
`body: { botToken, sessionId, doctorId, lang, openingText, objectionType, state, turnCallbackBaseUrl }`
(`turnCallbackBaseUrl` is this deployment's own origin, so the bot knows
where to POST `/turn`/`/session-result` — needed because the bot runs on
Pipecat Cloud's infrastructure, not this app's). Relays the start
response back to the browser:

```ts
{ roomUrl: string; roomToken: string }
```

(mapped from Pipecat Cloud's `dailyRoom`/`dailyToken`), which the browser
hands to `@daily-co/daily-js` to join.

**`POST /api/voice-partner/turn`** — modified, additively. Currently
requires an `audio` blob and transcribes it via Whisper
(`transcribeAudio`, `voice-partner-core.ts:370`). New: accepts an
optional `repText` field; when present, skips `transcribeAudio` entirely
and uses it directly as the rep's line (this is what the bot sends —
Deepgram already transcribed it). `audio` stays required when `repText`
is absent, so any existing non-realtime caller is unaffected. Auth check
swaps from a bare `getUser()` call to
`authenticateVoicePartnerRequest(req)`; on the bearer-token path, the
`doctors` lookup adds `.eq('rep_id', userId)` via `createAdminClient()`
instead of relying on RLS. Response shape unchanged:
`{ repText, doctorText, outcome, turnCount, clearSteps, state }`.

**`POST /api/voice-partner/session-result`** — same auth swap
(`authenticateVoicePartnerRequest` + admin client on the bearer path),
body and behavior otherwise unchanged. Called by the bot once, when
`outcome !== 'continue'` comes back from a `/turn` call.

## Client

`useVoicePartner.ts` rewritten around `@daily-co/daily-js`. Flow:
`startVoicePartner` still calls `/open` first, unchanged (gets
`sessionId`, `openingText`, `objectionType`, seeded `state`,
`difficulty`), then calls the new `/pipecat-session` with those results
and joins the returned Daily room. Phase machine becomes
`idle → opening → connecting → live → resolving → idle` — `live` covers
the whole continuous conversation, not one turn; mic is always open once
connected (Daily handles the actual streaming). The hook listens for
Daily app-messages and updates `transcript`, `turnCount`, `clearStepsHit`,
and `physicianState` from `{type:'rep_text'|'doctor_text'}` and
`{type:'outcome', outcome, state, clearSteps}` events exactly as it
updated them from `/turn`'s JSON response before — same state shape,
different event source. `objectionType` and `difficulty` still come from
`/open`'s response, unchanged.

`VoicePartner.tsx` keeps the same visual shell (doctor avatar/header,
scrolling transcript bubbles, turn counter, win/escalate `Feedback`
component, `onDone` call) — the realtime backend is invisible in the UI
except: no more discrete mic-tap button (replaced by a single
join/leave call control, since the mic is continuously live), and the
doctor's TTS audio can now be interrupted (Daily/Pipecat handles ducking
the bot's audio out when the rep's VAD triggers mid-reply).

## Persistence

Unchanged, split the same way it is today across two tiers:

- **Per-turn evidence** (`conversation_turns` from `/open`+`/turn`) and
  **session outcome** (`voice_partner_sessions` from `/session-result`)
  — server writes, now triggered by the bot (via the bearer-token path)
  instead of the browser, but same insert shape.
- **`doctor_visits` insert + XP award** — stay exactly where they are
  today: client-side, in `VisitPrep.tsx`'s `VoicePartnerScreen` wrapper
  (`onDone` handler, `VisitPrep.tsx:687-702`) and
  `useVoicePartner.ts`'s `awardXpOnWin` (`useVoicePartner.ts:80-87`).
  The client already learns the final outcome from the same data-channel
  `{type:'outcome'}` event that ends the `live` phase — one trigger
  point, same as today's `/turn` response ending the loop, so there's no
  new race to introduce by moving this server-side.

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
- No partial-turn writes to `doctor_visits` — only the client's `onDone`
  handler writes it, and only once, triggered by the terminal `outcome`
  event, same as before.

## Testing

`voice-partner-core.test.ts`'s existing coverage of `resolveTurn`/
`applyStateDelta`/`parseJudgeResponse` needs no changes — untouched
logic. New pure-function unit tests (vitest):

- `voice-partner-bot-token.test.ts`: `signBotToken` → `verifyBotToken`
  round-trips correctly; an expired token, a tampered token, and a token
  signed for a different `sessionId` all fail verification.
- `voice-partner-auth.test.ts` (or inline in the route tests):
  `authenticateVoicePartnerRequest` picks the bearer path when the header
  is present and valid, falls back to cookie auth otherwise, rejects an
  invalid/expired bearer token outright rather than falling back to
  cookie auth (a bad token should never silently downgrade to a weaker
  check).
- `/api/voice-partner/turn`'s existing test coverage (if any) gets a case
  for the `repText`-present branch skipping `transcribeAudio`.

Manual browser verification (the realtime pipeline itself isn't
unit-testable): full Daily join → live conversation → barge-in works
(interrupt the doctor mid-line, doctor's audio actually stops) →
`resolveTurn` ends the session correctly on `won`/`escalated` → hard-cap
escalate path at turn 5 → both languages → guardrail spot-check (no
invented clinical claims across several sessions) → `doctor_visits` row +
XP land correctly → "coming soon" teaser renders with the flag off.

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
