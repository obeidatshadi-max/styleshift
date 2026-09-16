# AI Voice Partner — Realtime (Pipecat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the turn-based AI Voice Partner (tap mic → Whisper → Claude → TTS round trip) with a continuous, interruptible realtime voice session, orchestrated by a Pipecat bot on Pipecat Cloud, while keeping all existing persona/guardrail/physician-state/CLEAR-step judging logic untouched.

**Architecture:** Browser joins a Daily room (provisioned by Pipecat Cloud) and talks continuously to a Pipecat bot. The bot does STT (Deepgram) and TTS (ElevenLabs) only — every completed rep turn, it POSTs the transcript to the existing `/api/voice-partner/turn` route (now reachable via a new short-lived bearer token instead of the browser's cookie), gets back the doctor's line + verdict from the unchanged `voice-partner-core.ts` judge logic, and speaks it. The browser listens passively over Daily's data channel for transcript/outcome events to drive the same UI it has today.

**Tech Stack:** Next.js 16 (existing), TypeScript, Supabase, `@daily-co/daily-js` (new client dep), Python 3.11+ / Pipecat (new `pipecat-bot/` project), Pipecat Cloud (hosting), Deepgram (STT), ElevenLabs (TTS), Anthropic Claude Haiku (unchanged).

**Spec:** `docs/superpowers/specs/2026-09-16-ai-voice-partner-realtime-design.md`

## Global Constraints

- `voice-partner-core.ts`'s persona/guardrail/judge/state functions are NOT modified by this plan — every task that touches `/open`, `/turn`, or `/session-result` must preserve their existing behavior for any caller that doesn't use the new bearer-token path.
- New env vars for Next.js: `PIPECAT_CLOUD_API_KEY`, `VOICE_PARTNER_BOT_TOKEN_SECRET`, `PIPECAT_AGENT_NAME` (defaults to `styleshift-voice-partner` if unset). `AI_VOICE_PARTNER_ENABLED` gate is reused, not renamed.
- The Pipecat bot never receives `ANTHROPIC_API_KEY` or any Supabase credential — it only ever calls back into this app's own `/turn`/`/session-result` routes over HTTPS with its bearer token.
- Bot token TTL is 10 minutes (covers a full `TURN_CAP = 5` conversation); an expired or invalid bearer token must fail closed, never silently fall back to cookie auth.
- Match existing code style: no comments explaining *what* code does, only non-obvious *why* (see any existing file in `src/lib/`).

---

## Task 1: Bot token sign/verify

**Files:**
- Create: `src/lib/voice-partner-bot-token.ts`
- Test: `src/lib/voice-partner-bot-token.test.ts`

**Interfaces:**
- Produces: `signBotToken(claims: { userId: string; doctorId: string; sessionId: string }): string`, `verifyBotToken(token: string): BotTokenClaims | null`, `type BotTokenClaims = { userId: string; doctorId: string; sessionId: string; exp: number }`. Both accept an optional second `secret` param (defaults to `process.env.VOICE_PARTNER_BOT_TOKEN_SECRET`) purely so tests can inject a fixed secret without mutating `process.env`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/voice-partner-bot-token.test.ts
import { describe, it, expect } from 'vitest'
import { signBotToken, verifyBotToken } from './voice-partner-bot-token'

const SECRET = 'test-secret-do-not-use-in-prod'
const CLAIMS = { userId: 'u1', doctorId: 'd1', sessionId: 's1' }

describe('signBotToken / verifyBotToken', () => {
  it('round-trips valid claims', () => {
    const token = signBotToken(CLAIMS, SECRET)
    const verified = verifyBotToken(token, SECRET)
    expect(verified).toMatchObject(CLAIMS)
    expect(typeof verified?.exp).toBe('number')
  })

  it('rejects a token signed with a different secret', () => {
    const token = signBotToken(CLAIMS, SECRET)
    expect(verifyBotToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const token = signBotToken(CLAIMS, SECRET)
    const [payload, sig] = token.split('.')
    const tampered = Buffer.from(JSON.stringify({ ...CLAIMS, userId: 'attacker' })).toString('base64url')
    expect(verifyBotToken(`${tampered}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects an expired token', () => {
    const almostExpired = signBotToken(CLAIMS, SECRET, -1)
    expect(verifyBotToken(almostExpired, SECRET)).toBeNull()
  })

  it('rejects a malformed token string', () => {
    expect(verifyBotToken('not-a-real-token', SECRET)).toBeNull()
    expect(verifyBotToken('', SECRET)).toBeNull()
  })

  it('returns null when no secret is configured', () => {
    expect(verifyBotToken('anything', undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/voice-partner-bot-token.test.ts`
Expected: FAIL — `Cannot find module './voice-partner-bot-token'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/voice-partner-bot-token.ts
import { createHmac, timingSafeEqual } from 'crypto'

export interface BotTokenClaims {
  userId: string
  doctorId: string
  sessionId: string
  exp: number
}

const DEFAULT_TTL_MS = 10 * 60 * 1000

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Compact HMAC-signed token, not a JWT — this app has no other JWT
 * usage, and the claim set is fixed and tiny, so a hand-rolled
 * `payload.signature` pair (matching the hand-rolled rate-limit/admin-
 * client patterns already in `src/lib/`) avoids a new dependency for a
 * one-off internal token. `ttlMs` param exists only so the expiry test
 * can mint an already-expired token deterministically. */
export function signBotToken(
  claims: { userId: string; doctorId: string; sessionId: string },
  secret: string | undefined = process.env.VOICE_PARTNER_BOT_TOKEN_SECRET,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  if (!secret) throw new Error('VOICE_PARTNER_BOT_TOKEN_SECRET not configured')
  const payload: BotTokenClaims = { ...claims, exp: Date.now() + ttlMs }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

function isBotTokenClaims(value: unknown): value is BotTokenClaims {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return typeof c.userId === 'string' && typeof c.doctorId === 'string'
    && typeof c.sessionId === 'string' && typeof c.exp === 'number'
}

export function verifyBotToken(
  token: string,
  secret: string | undefined = process.env.VOICE_PARTNER_BOT_TOKEN_SECRET,
): BotTokenClaims | null {
  if (!secret || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = sign(payloadB64, secret)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null
  let claims: unknown
  try { claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) } catch { return null }
  if (!isBotTokenClaims(claims)) return null
  if (claims.exp < Date.now()) return null
  return claims
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/voice-partner-bot-token.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-partner-bot-token.ts src/lib/voice-partner-bot-token.test.ts
git commit -m "feat: signed bot token for voice-partner bearer auth"
```

---

## Task 2: Auth bridge helper

**Files:**
- Create: `src/lib/voice-partner-auth.ts`

**Interfaces:**
- Consumes: `verifyBotToken` from Task 1 (`src/lib/voice-partner-bot-token.ts`); `createClient` from `@/lib/supabase-server`.
- Produces: `authenticateVoicePartnerRequest(req: Request): Promise<VoicePartnerAuth | null>`, `type VoicePartnerAuth = { userId: string; viaToken: true; claims: BotTokenClaims } | { userId: string; viaToken: false }`. `null` means "reject with 401" — callers don't need to know why.

No test file for this task: it's thin glue over two already-covered things (a pure, unit-tested token verifier, and the existing cookie-session check every other route in this codebase already uses uncovered — see `src/app/api/voice-partner/open/route.ts:17-19` for the established pattern of not unit-testing the auth call itself). Manual verification happens in Task 8's end-to-end pass.

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/voice-partner-auth.ts
import { createClient } from '@/lib/supabase-server'
import { verifyBotToken, type BotTokenClaims } from '@/lib/voice-partner-bot-token'

export type VoicePartnerAuth =
  | { userId: string; viaToken: true; claims: BotTokenClaims }
  | { userId: string; viaToken: false }

/** The Pipecat bot has no Supabase session cookie, so it authenticates
 * with a bearer token instead (see `voice-partner-bot-token.ts`). A
 * present-but-invalid bearer token fails outright rather than falling
 * back to the cookie check — silently downgrading to a weaker check on
 * a bad token would defeat the point of requiring one. */
export async function authenticateVoicePartnerRequest(req: Request): Promise<VoicePartnerAuth | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const claims = verifyBotToken(authHeader.slice('Bearer '.length))
    if (!claims) return null
    return { userId: claims.userId, viaToken: true, claims }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, viaToken: false }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/voice-partner-auth.ts
git commit -m "feat: bearer-token/cookie auth bridge for voice-partner routes"
```

---

## Task 3: `/api/voice-partner/turn` — accept `repText`, switch auth

**Files:**
- Modify: `src/app/api/voice-partner/turn/route.ts`

**Interfaces:**
- Consumes: `authenticateVoicePartnerRequest` (Task 2); `createAdminClient` from `@/lib/supabase-admin` (existing).
- Produces: same response shape as today — `{ repText, doctorText, outcome, turnCount, clearSteps, state }`. No change for callers still sending `audio`.

- [ ] **Step 1: Modify the auth check**

In `src/app/api/voice-partner/turn/route.ts`, replace:

```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

with:

```ts
  const auth = await authenticateVoicePartnerRequest(req)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = { id: auth.userId }
  const supabase = auth.viaToken ? createAdminClient() : await createClient()
```

and update the imports at the top of the file:

```ts
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { authenticateVoicePartnerRequest } from '@/lib/voice-partner-auth'
```

(`createClient` import stays — still used on the cookie path.)

- [ ] **Step 2: Add ownership check for the admin-client path**

RLS enforces `rep_id = auth.uid()` on the cookie path automatically; the
admin client bypasses RLS, so the doctor lookup needs the same check made
explicit. Replace:

```ts
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
```

with:

```ts
  const { data: doctor } = await supabase.from('doctors').select('*')
    .eq('id', doctorId).eq('rep_id', user.id).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
```

(This is a strict tightening on the cookie path too — RLS already
enforced it there, so the added `.eq` is a no-op for existing callers.)

- [ ] **Step 3: Make `audio` conditional on `repText` being absent**

`validateAudioUpload` rejects a zero-byte blob (`audio-upload.ts:18`), so
the bot — which has no audio blob to send, only Deepgram's already-final
text — can't satisfy the existing unconditional audio check. Move audio
validation behind a `repText`-absent branch instead of faking bytes.

Replace:

```ts
  const historyRaw = form.get('history')
  const audioCheck = validateAudioUpload(form.get('audio'))
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof sessionId !== 'string' || !sessionId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!audioCheck.ok) return NextResponse.json({ error: audioCheck.error }, { status: audioCheck.status })
  const audio = audioCheck.blob
```

with:

```ts
  const historyRaw = form.get('history')
  const repTextField = form.get('repText')
  const repTextInput = typeof repTextField === 'string' ? repTextField.trim() : ''
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof sessionId !== 'string' || !sessionId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  let audio: Blob | null = null
  if (!repTextInput) {
    const audioCheck = validateAudioUpload(form.get('audio'))
    if (!audioCheck.ok) return NextResponse.json({ error: audioCheck.error }, { status: audioCheck.status })
    audio = audioCheck.blob
  }
```

Then replace:

```ts
  const repText = await transcribeAudio(audio, openaiKey, lang)
  if (!repText) return NextResponse.json({ error: 'upstream' }, { status: 502 })
```

with:

```ts
  const repText = repTextInput || (audio ? await transcribeAudio(audio, openaiKey, lang) : null)
  if (!repText) return NextResponse.json({ error: 'upstream' }, { status: 502 })
```

The bot (Task 7) sends only `repText` in its form data — no `audio`
field at all. Any existing caller that sends `audio` and no `repText`
keeps working exactly as before.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 5: Manual verification**

Run `npm run dev`, exercise the existing turn-based flow in the browser
(flag `AI_VOICE_PARTNER_ENABLED=true` set) end to end — confirm nothing
regressed (audio-only path still transcribes via Whisper as before).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice-partner/turn/route.ts
git commit -m "feat: bearer-token auth + repText branch on voice-partner turn route"
```

---

## Task 4: `/api/voice-partner/session-result` — switch auth

**Files:**
- Modify: `src/app/api/voice-partner/session-result/route.ts`

**Interfaces:**
- Consumes: `authenticateVoicePartnerRequest` (Task 2), `createAdminClient` (existing).

- [ ] **Step 1: Apply the same auth swap as Task 3**

Replace:

```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

with:

```ts
  const auth = await authenticateVoicePartnerRequest(req)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = { id: auth.userId }
  const supabase = auth.viaToken ? createAdminClient() : await createClient()
```

Update imports the same way as Task 3 (`createAdminClient`,
`authenticateVoicePartnerRequest`).

- [ ] **Step 2: Add ownership check for the admin-client path**

Replace:

```ts
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
```

with:

```ts
  const { data: doctor } = await supabase.from('doctors').select('*')
    .eq('id', body.doctorId).eq('rep_id', user.id).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/voice-partner/session-result/route.ts
git commit -m "feat: bearer-token auth on voice-partner session-result route"
```

---

## Task 5: `/api/voice-partner/pipecat-session` — new route

**Files:**
- Create: `src/app/api/voice-partner/pipecat-session/route.ts`

**Interfaces:**
- Consumes: `signBotToken` (Task 1), `checkRateLimit` (existing `@/lib/rate-limit`), `isObjectionType`/`isPhysicianState`/`isDifficulty` (existing `@/lib/voice-partner-core`).
- Produces: `POST` handler returning `{ roomUrl: string; roomToken: string }`.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/voice-partner/pipecat-session/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { signBotToken } from '@/lib/voice-partner-bot-token'
import { isObjectionType, isPhysicianState, isDifficulty } from '@/lib/voice-partner-core'

export async function POST(req: Request) {
  const pipecatKey = process.env.PIPECAT_CLOUD_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !pipecatKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/session-result — one Pipecat Cloud
  // session-start is itself a billable event, same reasoning as the
  // existing routes' shared limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as {
    doctorId?: string; sessionId?: string; lang?: 'en' | 'ar'
    openingText?: string; objectionType?: string
    state?: unknown; difficulty?: string
  } | null

  if (!body?.doctorId || !body.sessionId || !body.openingText)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isObjectionType(body.objectionType))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isPhysicianState(body.state))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.difficulty !== undefined && !isDifficulty(body.difficulty))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const lang = body.lang === 'ar' ? 'ar' : 'en'
  const botToken = signBotToken({ userId: user.id, doctorId: body.doctorId, sessionId: body.sessionId })
  const agentName = process.env.PIPECAT_AGENT_NAME || 'styleshift-voice-partner'
  const turnCallbackBaseUrl = new URL(req.url).origin

  let res: Response
  try {
    res = await fetch(`https://api.pipecat.daily.co/v1/public/${agentName}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${pipecatKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        createDailyRoom: true,
        body: {
          botToken, sessionId: body.sessionId, doctorId: body.doctorId, lang,
          openingText: body.openingText, objectionType: body.objectionType,
          state: body.state, turnCallbackBaseUrl,
        },
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { dailyRoom?: string; dailyToken?: string } | null
  if (!data?.dailyRoom || !data.dailyToken) return NextResponse.json({ error: 'invalid' }, { status: 502 })

  return NextResponse.json({ roomUrl: data.dailyRoom, roomToken: data.dailyToken })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice-partner/pipecat-session/route.ts
git commit -m "feat: pipecat-session route to start a realtime voice-partner bot"
```

---

## Task 6: Pipecat bot project scaffold

**Files:**
- Create: `pipecat-bot/pyproject.toml`
- Create: `pipecat-bot/Dockerfile`
- Create: `pipecat-bot/pcc-deploy.toml`
- Create: `pipecat-bot/.env.example`

New top-level folder alongside the Next.js app — a separate deployable
Python project (Pipecat Cloud builds/runs it independently of Netlify).

**Interfaces:**
- Produces: a buildable Pipecat Cloud project shell that Task 7's `bot.py` drops into.

- [ ] **Step 1: `pyproject.toml`**

```toml
[project]
name = "styleshift-voice-partner-bot"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "pipecat-ai[daily,deepgram,elevenlabs]",
  "httpx",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

Before finalizing this file, use the `pipecat-context-hub` MCP server to
confirm the current `pipecat-ai` extras group names for Daily/Deepgram/
ElevenLabs (they've been renamed between releases) and pin an exact
version rather than leaving it floating.

- [ ] **Step 2: `Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY bot.py .
CMD ["python", "bot.py"]
```

- [ ] **Step 3: `pcc-deploy.toml`**

```toml
agent_name = "styleshift-voice-partner"
secret_set = "styleshift-voice-partner-secrets"

[scaling]
min_agents = 0
```

`min_agents = 0` — this is a low-volume solo-rep-practice feature, not a
production call center; no need to keep an idle agent warm and billing.

- [ ] **Step 4: `.env.example`** (local-dev reference only, not deployed)

```
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
```

- [ ] **Step 5: Commit**

```bash
cd pipecat-bot
git add pyproject.toml Dockerfile pcc-deploy.toml .env.example
git commit -m "feat: scaffold Pipecat Cloud bot project"
```

---

## Task 7: Pipecat bot — `bot.py`

**Files:**
- Create: `pipecat-bot/bot.py`

**Interfaces:**
- Consumes: session `body` from `pipecat-session` (Task 5): `{ botToken, sessionId, doctorId, lang, openingText, objectionType, state, turnCallbackBaseUrl }`.
- Produces: a running bot that speaks `openingText` on connect, then for each completed rep turn POSTs to `{turnCallbackBaseUrl}/api/voice-partner/turn` and speaks the response, ending the call and POSTing `/session-result` when `outcome !== 'continue'`.

No automated test — this file has no local test harness in this repo
(Python is new to the project; introducing pytest for one file that's
fundamentally a live audio loop is out of scope, matches the spec's own
"manual browser verification" call for the realtime pipeline). Verified
in Task 9's end-to-end pass.

- [ ] **Step 1: Write the bot**

Before writing this file, use the `pipecat-context-hub` MCP server to
confirm current, exact: `DailyTransport` construction and
`RunnerArguments`/session-`body` access, `DeepgramSTTService` and
`ElevenLabsTTSService` constructor signatures, the transcription frame
type name and its "is this a final transcript" field, how to send a
Daily app-message from within a `FrameProcessor`, and how to end a
session/leave the room from bot code. The shape below is architecturally
correct per the spec (STT → custom judge-relay processor → TTS, no LLM
node in the pipeline) but Pipecat's exact class/import names shift
between releases — verify against current docs rather than assuming this
matches the installed version verbatim.

```python
# pipecat-bot/bot.py
import asyncio
import json
import os

import httpx
from pipecat.frames.frames import EndFrame, TextFrame, TranscriptionFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.services.daily import DailyParams, DailyTransport

TURN_CAP = 5  # mirrors voice-partner-core.ts TURN_CAP — the server is
# the source of truth for the actual cap; this is only a client-side
# sanity bound on how many turns this process expects to run.


class VoicePartnerJudgeProcessor(FrameProcessor):
    """Replaces the usual LLM node. On each final transcript, calls back
    into the existing Next.js /turn route (all persona/guardrail/judge
    logic lives there, unchanged) and pushes the doctor's reply as a
    TextFrame for TTS, instead of ever calling an LLM directly."""

    def __init__(self, transport: DailyTransport, session: dict):
        super().__init__()
        self._transport = transport
        self._session = session
        self._history: list[dict] = [{"role": "doctor", "text": session["openingText"]}]
        self._state = session["state"]
        self._clear_steps_hit: list[str] = []
        self._turn_count = 0
        self._client = httpx.AsyncClient(
            base_url=session["turnCallbackBaseUrl"],
            headers={"authorization": f"Bearer {session['botToken']}"},
            timeout=30.0,
        )

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and getattr(frame, "text", "").strip():
            await self._handle_rep_turn(frame.text.strip())
            return  # don't forward the raw transcription frame further

        await self.push_frame(frame, direction)

    async def _handle_rep_turn(self, rep_text: str):
        await self._broadcast({"type": "rep_text", "text": rep_text})

        form = {
            "doctorId": self._session["doctorId"],
            "sessionId": self._session["sessionId"],
            "lang": self._session["lang"],
            "history": json.dumps(self._history),
            "repText": rep_text,
            "objectionType": self._session["objectionType"],
            "state": json.dumps(self._state),
            "clearStepsHit": json.dumps(self._clear_steps_hit),
        }
        # No `audio` field at all — the route (Task 3) only requires one
        # when `repText` is absent.
        resp = await self._client.post("/api/voice-partner/turn", data=form)
        if resp.status_code != 200:
            await self._broadcast({"type": "error", "stage": "turn", "status": resp.status_code})
            return

        data = resp.json()
        self._history.append({"role": "rep", "text": rep_text})
        self._history.append({"role": "doctor", "text": data["doctorText"]})
        self._state = data["state"]
        self._clear_steps_hit = list(set(self._clear_steps_hit) | set(data["clearSteps"]))
        self._turn_count = data["turnCount"]

        await self._broadcast({
            "type": "doctor_text", "text": data["doctorText"],
            "outcome": data["outcome"], "turnCount": self._turn_count,
            "clearSteps": self._clear_steps_hit, "state": self._state,
        })
        await self.push_frame(TextFrame(data["doctorText"]))

        if data["outcome"] != "continue":
            await self._resolve_session(data["outcome"])

    async def _resolve_session(self, outcome: str):
        await self._client.post("/api/voice-partner/session-result", json={
            "doctorId": self._session["doctorId"],
            "sessionId": self._session["sessionId"],
            "objectionType": self._session["objectionType"],
            "outcome": outcome,
            "clearSteps": self._clear_steps_hit,
            "turnCount": self._turn_count,
            "difficulty": self._session.get("difficulty"),
        })
        await self._broadcast({"type": "outcome", "outcome": outcome, "state": self._state})
        await asyncio.sleep(2)  # let the final TTS line finish playing
        await self.push_frame(EndFrame())

    async def _broadcast(self, message: dict):
        await self._transport.send_message(message)


async def bot(args):
    session = args.body
    transport = DailyTransport(
        args.room_url, args.token, "AI Doctor",
        DailyParams(audio_out_enabled=True, transcription_enabled=False),
    )
    stt = DeepgramSTTService(api_key=os.environ["DEEPGRAM_API_KEY"], language=session["lang"])
    tts = ElevenLabsTTSService(api_key=os.environ["ELEVENLABS_API_KEY"], language=session["lang"])
    judge = VoicePartnerJudgeProcessor(transport, session)

    pipeline = Pipeline([transport.input(), stt, judge, tts, transport.output()])
    task = PipelineTask(pipeline)

    @transport.event_handler("on_client_connected")
    async def on_connected(_transport, _client):
        await task.queue_frame(TextFrame(session["openingText"]))
        await judge._broadcast({"type": "doctor_text", "text": session["openingText"], "outcome": "continue", "turnCount": 0, "clearSteps": [], "state": session["state"]})

    runner = PipelineRunner()
    await runner.run(task)
```

- [ ] **Step 2: Commit**

```bash
cd pipecat-bot
git add bot.py
git commit -m "feat: Pipecat bot — STT/TTS around the existing turn judge route"
```

---

## Task 8: Deploy the bot to Pipecat Cloud

**Files:** none (operational task)

- [ ] **Step 1: Install the Pipecat CLI**

Run: `uv tool install "pipecat-ai[cli]"` (or `pip install pipecat-ai-cli`)

- [ ] **Step 2: Authenticate**

Run: `pipecat cloud auth login`

- [ ] **Step 3: Create the bot's secret set**

Create `pipecat-bot/.env` (gitignored, not `.env.example`) with real
`DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` values, then:

Run: `cd pipecat-bot && pipecat cloud secrets set styleshift-voice-partner-secrets --file .env`

- [ ] **Step 4: Deploy**

Run: `cd pipecat-bot && pipecat cloud deploy`
Expected: deploy succeeds, `pipecat cloud agent status styleshift-voice-partner` shows the agent healthy.

- [ ] **Step 5: Get a public API key and record it**

Run: `pipecat cloud agent list` / the Pipecat Cloud dashboard to obtain
the public API key for this agent. Add it to the Next.js app's
`.env.local` as `PIPECAT_CLOUD_API_KEY`, and to Netlify's environment
variables for the deployed app. Also set `VOICE_PARTNER_BOT_TOKEN_SECRET`
(any long random string, e.g. `openssl rand -hex 32`) in both places.

---

## Task 9: Client — `useVoicePartner.ts` rewrite

**Files:**
- Modify: `src/hooks/useVoicePartner.ts`
- Add dependency: `@daily-co/daily-js`

**Interfaces:**
- Consumes: `/api/voice-partner/open` (unchanged), new `/api/voice-partner/pipecat-session` (Task 5).
- Produces: same public hook shape `VoicePartner.tsx` already consumes — `phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit, sessionId, startVoicePartner, reset` — minus the recording-specific fields (`previewUrl`, `startRecording`, `stopRecording`, `confirmRecording`, `rerecord`), which Task 10 removes from the UI.

- [ ] **Step 1: Add the dependency**

Run: `npm install @daily-co/daily-js`

- [ ] **Step 2: Rewrite the hook**

```ts
// src/hooks/useVoicePartner.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import Daily, { type DailyCall } from '@daily-co/daily-js'
import type { VoicePartnerTurn, TurnOutcome, ObjectionType, ClearStep, PhysicianState, Difficulty } from '@/lib/voice-partner-core'
import { isObjectionType, isClearStep, isPhysicianState, isDifficulty } from '@/lib/voice-partner-core'
import { logVoiceEvent } from '@/lib/voice-events'
import type { VoiceErrorKind } from '@/lib/voice-events'

export type VoicePartnerPhase =
  | 'idle' | 'opening' | 'connecting' | 'live' | 'notconfigured' | 'ratelimited' | 'error'

type AppMessage =
  | { type: 'rep_text'; text: string }
  | { type: 'doctor_text'; text: string; outcome: TurnOutcome; turnCount: number; clearSteps: ClearStep[]; state: PhysicianState }
  | { type: 'outcome'; outcome: 'won' | 'escalated'; state: PhysicianState }
  | { type: 'error'; stage: string; status: number }

export function useVoicePartner(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerPhase>('idle')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [transcript, setTranscript] = useState<VoicePartnerTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null)
  const [openingText, setOpeningText] = useState('')
  const [objectionType, setObjectionType] = useState<ObjectionType | null>(null)
  const [clearStepsHit, setClearStepsHit] = useState<ClearStep[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [physicianState, setPhysicianState] = useState<PhysicianState | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const callRef = useRef<DailyCall | null>(null)

  const startVoicePartner = useCallback(async (difficultyChoice?: Difficulty) => {
    setPhase('opening')
    setErrorKind(null)
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setObjectionType(null)
    setClearStepsHit([])
    setSessionId(null)
    setPhysicianState(null)
    setDifficulty(null)

    try {
      const openRes = await fetch('/api/voice-partner/open', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang, ...(difficultyChoice ? { difficulty: difficultyChoice } : {}) }),
      })
      if (openRes.status === 503) { setPhase('notconfigured'); logVoiceEvent('objection', lang, 'not_configured', { endpoint: 'open' }); return }
      if (openRes.status === 429) { setPhase('ratelimited'); logVoiceEvent('objection', lang, 'rate_limited', { endpoint: 'open' }); return }
      if (!openRes.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('objection', lang, 'api_error', { endpoint: 'open', status: openRes.status }); return }
      const openData = await openRes.json().catch(() => null) as {
        doctorText?: string; objectionType?: string; sessionId?: string; state?: PhysicianState; difficulty?: string
      } | null
      if (!openData?.doctorText || !isObjectionType(openData.objectionType) || !openData.sessionId || !isPhysicianState(openData.state)) {
        setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('objection', lang, 'bad_response', { endpoint: 'open' }); return
      }

      setPhase('connecting')
      const sessionRes = await fetch('/api/voice-partner/pipecat-session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doctorId, lang, sessionId: openData.sessionId, openingText: openData.doctorText,
          objectionType: openData.objectionType, state: openData.state,
          ...(isDifficulty(openData.difficulty) ? { difficulty: openData.difficulty } : {}),
        }),
      })
      if (sessionRes.status === 503) { setPhase('notconfigured'); logVoiceEvent('objection', lang, 'not_configured', { endpoint: 'pipecat-session' }); return }
      if (sessionRes.status === 429) { setPhase('ratelimited'); logVoiceEvent('objection', lang, 'rate_limited', { endpoint: 'pipecat-session' }); return }
      if (!sessionRes.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('objection', lang, 'api_error', { endpoint: 'pipecat-session', status: sessionRes.status }); return }
      const sessionData = await sessionRes.json().catch(() => null) as { roomUrl?: string; roomToken?: string } | null
      if (!sessionData?.roomUrl || !sessionData.roomToken) {
        setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('objection', lang, 'bad_response', { endpoint: 'pipecat-session' }); return
      }

      setOpeningText(openData.doctorText)
      setObjectionType(openData.objectionType)
      setSessionId(openData.sessionId)
      setPhysicianState(openData.state)
      setDifficulty(isDifficulty(openData.difficulty) ? openData.difficulty : null)
      setTranscript([{ role: 'doctor', text: openData.doctorText }])

      const call = Daily.createCallObject()
      callRef.current = call
      call.on('app-message', (ev: { data: AppMessage }) => handleAppMessage(ev.data))
      call.on('left-meeting', () => { setPhase('idle') })

      try {
        await call.join({ url: sessionData.roomUrl, token: sessionData.roomToken })
      } catch (joinErr) {
        // Daily's join() requests mic access internally; a denied
        // getUserMedia prompt surfaces as a DOMException named
        // NotAllowedError — distinguish that from a real connection
        // failure so the UI shows the right guidance (matches the
        // 'mic' error state the old MediaRecorder path used).
        const isMicDenied = joinErr instanceof DOMException && joinErr.name === 'NotAllowedError'
        setPhase('error')
        setErrorKind(isMicDenied ? 'mic' : 'network')
        logVoiceEvent('objection', lang, isMicDenied ? 'mic_denied' : 'network_error', { endpoint: 'daily_join' })
        call.destroy()
        callRef.current = null
        return
      }
      setPhase('live')
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('objection', lang, 'network_error', { endpoint: 'open' })
    }
  }, [doctorId, lang])

  const handleAppMessage = useCallback((msg: AppMessage) => {
    if (msg.type === 'rep_text') {
      setTranscript(prev => [...prev, { role: 'rep', text: msg.text }])
      return
    }
    if (msg.type === 'doctor_text') {
      setTranscript(prev => [...prev, { role: 'doctor', text: msg.text }])
      setTurnCount(msg.turnCount)
      setClearStepsHit(prev => Array.from(new Set([...prev, ...msg.clearSteps.filter(isClearStep)])))
      setPhysicianState(msg.state)
      logVoiceEvent('objection', lang, msg.outcome !== 'continue' ? 'session_complete' : 'turn_complete', { turnCount: msg.turnCount })
      return
    }
    if (msg.type === 'outcome') {
      setOutcome(msg.outcome)
      setPhysicianState(msg.state)
      return
    }
    if (msg.type === 'error') {
      setErrorKind('api')
      logVoiceEvent('objection', lang, 'api_error', { endpoint: msg.stage, status: msg.status })
    }
  }, [lang])

  const reset = useCallback(() => {
    callRef.current?.leave()
    callRef.current?.destroy()
    callRef.current = null
    setPhase('idle')
    setErrorKind(null)
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setOpeningText('')
    setObjectionType(null)
    setClearStepsHit([])
    setSessionId(null)
    setPhysicianState(null)
    setDifficulty(null)
  }, [])

  return {
    phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit,
    sessionId, physicianState,
    startVoicePartner, reset,
  }
}
```

`awardXpOnWin`/`saveSessionResult` are gone from the hook — per the
spec's Persistence section, `doctor_visits` + XP stay in
`VisitPrep.tsx`'s `onDone` handler (Task 10 confirms it still fires
correctly off the `outcome` state), and `voice_partner_sessions` is now
written by the bot itself via `/session-result` (Task 7), not the
client.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useVoicePartner.ts package.json package-lock.json
git commit -m "feat: rewrite useVoicePartner around Daily realtime transport"
```

---

## Task 10: Client — `VoicePartner.tsx` wiring

**Files:**
- Modify: `src/components/game/VoicePartner.tsx`

**Interfaces:**
- Consumes: the Task 9 hook shape (no more `previewUrl`/`startRecording`/`stopRecording`/`confirmRecording`/`rerecord`).

- [ ] **Step 1: Update the hook destructure**

Replace:

```tsx
  const { phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit, previewUrl, sessionId, startVoicePartner, startRecording, stopRecording, confirmRecording, rerecord, reset } = useVoicePartner(doctor.id, lang)
```

with:

```tsx
  const { phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit, sessionId, startVoicePartner, reset } = useVoicePartner(doctor.id, lang)
```

- [ ] **Step 2: Update the status label map**

Replace:

```tsx
  const label =
    phase === 'opening' ? t('voice.connecting') :
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'ratelimited' ? t('voice.rateLimited') :
    phase === 'error' ? errorLabel :
    t('voice.tapToSpeak')
```

with:

```tsx
  const label =
    phase === 'opening' ? t('voice.connecting') :
    phase === 'connecting' ? t('voice.connecting') :
    phase === 'live' ? t('voice.listening') :
    phase === 'ratelimited' ? t('voice.rateLimited') :
    phase === 'error' ? errorLabel :
    t('voice.tapToSpeak')
```

- [ ] **Step 3: Replace the mic-tap control with a live-session indicator**

Replace the record/review button block (the `{!outcome && phase !== 'review' && (...)}` section containing the `🎙️` button and `startRecording`/`stopRecording` handlers) and remove the `{!outcome && phase === 'review' && previewUrl && (<RecordReviewControls .../>)}` block entirely — there's no more discrete recording step. In their place:

```tsx
        {!outcome && (
          <>
            <VoiceStatusAnnouncer text={label} />
            <div style={{
              width: '100%', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 13,
              letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--cyan)',
              border: '1px solid var(--cyan)', borderRadius: 10, padding: '14px 18px',
            }}>
              🎙️ {label}
            </div>
            <button
              onClick={() => { reset(); onDone(false, { turns: 0, openingCrisis: '' }) }}
              style={{ ...ghostBtn, marginTop: 10 }}
            >
              {t('voice.back')}
            </button>
          </>
        )}
```

(`RecordReviewControls` import in `./helpers` can stay — other
voice-partner sibling components, e.g. `VoicePartnerOpening.tsx`, still
use the tap/record flow and are out of scope for this spec.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Manual browser verification**

With `AI_VOICE_PARTNER_ENABLED=true` and all new env vars set (Task 8),
run `npm run dev`, open a doctor, start AI Voice Partner, and confirm:
mic connects and stays live (no tap-to-record button), doctor's opening
line plays automatically, speaking a reply produces a rep bubble then a
doctor reply bubble without any manual step, interrupting the doctor
mid-line actually stops its audio, the session resolves to won/escalated
correctly, `doctor_visits` gets a row and XP lands on a win, and the
"coming soon" teaser still renders with the flag off.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/VoicePartner.tsx
git commit -m "feat: wire VoicePartner UI to the realtime Daily session"
```

---

## Task 11: Env docs + cleanup

**Files:**
- Modify: `README.md` (or wherever env vars are documented — check for an existing "Environment variables" section before adding a new one)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Document the new env vars**

Add `PIPECAT_CLOUD_API_KEY`, `VOICE_PARTNER_BOT_TOKEN_SECRET`,
`PIPECAT_AGENT_NAME` (optional, defaults to `styleshift-voice-partner`)
alongside the existing `AI_VOICE_PARTNER_ENABLED`/`ANTHROPIC_API_KEY`
documentation, following whatever format the file already uses. Note
that `DEEPGRAM_API_KEY`/`ELEVENLABS_API_KEY` are NOT Next.js env vars —
they belong to the bot's Pipecat Cloud secret set (`pipecat-bot/.env`,
gitignored, never deployed to Netlify).

- [ ] **Step 2: Confirm `OPENAI_API_KEY` is still required**

`/api/voice-partner/turn`'s `audio`-blob fallback path still calls
`transcribeAudio` (OpenAI Whisper) for any caller that doesn't send
`repText` — confirm the feature-flag gate in `open/route.ts` and
`turn/route.ts` still checks for it (unchanged from Task 3's edits).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document realtime voice-partner env vars"
```
