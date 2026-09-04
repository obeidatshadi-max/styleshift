# AI Voice Partner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a turn-based, free-speech solo practice mode where a rep speaks
out loud and an LLM voiced as the saved doctor persona replies in character,
adapting resistance across up to 5 turns until the rep wins or the doctor
walks away.

**Architecture:** Three new stateless API routes (`open`, `turn`, `speak`)
built on the existing Whisper (STT) / Claude Haiku (LLM) / OpenAI TTS
upstreams, a pure-logic module for prompt-building and turn resolution
(tested in isolation), a client hook driving the record → send → play loop,
and a presentational component wired into `VisitPrep.tsx` as a third
doctor-detail practice mode alongside Warm-up and the existing AI drill.

**Tech Stack:** Next.js 16 API routes (Node runtime), Claude Haiku
(`claude-haiku-4-5-20251001`) via direct `fetch` to `api.anthropic.com`,
OpenAI Whisper (`whisper-1`) + OpenAI TTS (`gpt-4o-mini-tts`) via direct
`fetch` to `api.openai.com`, Supabase (auth + `doctors`/`doctor_visits`/
`profiles` tables, existing RLS), Vitest for pure-logic tests.

**Spec:** `docs/superpowers/specs/2026-09-04-ai-voice-partner-design.md`

Two implementation refinements made while planning, both behavior-preserving
relative to the spec's intent:

1. **Three routes instead of one.** The spec described a single
   `/api/voice-partner/turn` doing STT→judge→TTS in one call, with the
   opening line implicitly reusing `generate-scenario`. Reusing
   `generate-scenario` directly would couple this feature to the
   `AI_DRILLS_ENABLED` flag — a different flag than this feature's own
   `AI_VOICE_PARTNER_ENABLED`, so the feature could silently break in a
   deployment where one flag is on and the other isn't. Splitting into
   `open` (generates the opening line), `turn` (STT + judge only), and
   `speak` (TTS only, called by the client after both `open` and `turn`)
   keeps the whole feature under one flag and one code path for voicing any
   doctor line.
2. **Hard turn-cap enforced server-side**, not client-side as the spec's
   prose suggested — `turnCount` is derived from `history.length` on the
   server (the source of truth for what's already happened), and
   `resolveTurn` is a pure, independently tested function. Same behavior,
   more trustworthy than relying on a client-sent counter.

## Global Constraints

- Model: `claude-haiku-4-5-20251001` (matches `generate-scenario`) for both
  opening-line generation and turn judging.
- STT: OpenAI `whisper-1`. TTS: OpenAI `gpt-4o-mini-tts`.
- Turn cap: 5 rep turns maximum (`TURN_CAP = 5` in `voice-partner-core.ts`).
- Feature flag: `AI_VOICE_PARTNER_ENABLED` — all three routes require
  `AI_VOICE_PARTNER_ENABLED === 'true'` AND both `ANTHROPIC_API_KEY` and
  `OPENAI_API_KEY` set, else `503 {error:'not_configured'}` (matches the
  `generate-scenario`/`transcribe` pattern exactly).
- Guardrail (verbatim rule set, all AI-generated doctor lines): never invent
  clinical data, efficacy numbers, statistics, trial results, study names,
  dosages, or real/branded drug names; refer to the product only as "your
  product"; never break character to explain scoring; stay in character as
  the doctor throughout.
- `DoctorVisit.source` union gains `'voice_partner'`.
- XP: new `XP_VALUES.voicePartnerWin = 40`, awarded only when the session
  resolves `'won'`.
- All new UI copy needs both an EN and an AR key in `src/lib/i18n.tsx` — the
  app has no partial-translation fallback.

---

### Task 1: Types + XP value

**Files:**
- Modify: `src/types/game.ts`
- Modify: `src/lib/game-data.ts`

**Interfaces:**
- Produces: `DoctorVisit['source']` including `'voice_partner'`;
  `XP_VALUES.voicePartnerWin: number`.

- [ ] **Step 1: Extend `DoctorVisit['source']` and add the XP field to `XpValues`**

In `src/types/game.ts`, find:

```ts
export interface DoctorVisit {
  id: string
  doctor_id: string
  rep_id: string
  source: 'manual' | 'warmup' | 'ai_drill'
```

Change the `source` line to:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner'
```

Find:

```ts
export interface XpValues {
  correct: number; fastBonus: number; levelComplete: number
  perfectLevel: number; dailyStreak: number; roleplayComplete: number
}
```

Change to:

```ts
export interface XpValues {
  correct: number; fastBonus: number; levelComplete: number
  perfectLevel: number; dailyStreak: number; roleplayComplete: number
  voicePartnerWin: number
}
```

- [ ] **Step 2: Add the XP value**

In `src/lib/game-data.ts`, find:

```ts
export const XP_VALUES: XpValues = {
  correct:         20,
  fastBonus:       10,
  levelComplete:   50,
  perfectLevel:    100,
  dailyStreak:     30,
  roleplayComplete: 40,
}
```

Change to:

```ts
export const XP_VALUES: XpValues = {
  correct:         20,
  fastBonus:       10,
  levelComplete:   50,
  perfectLevel:    100,
  dailyStreak:     30,
  roleplayComplete: 40,
  voicePartnerWin:  40,
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the `XpValues` change is additive; nothing else
constructs an `XpValues` object literal outside `game-data.ts`, so no other
call site needs updating).

- [ ] **Step 4: Commit**

```bash
git add src/types/game.ts src/lib/game-data.ts
git commit -m "feat: add voice_partner visit source and XP value"
```

---

### Task 2: Extract shared doctor-persona helpers (`doctor-context.ts`)

`generate-scenario/route.ts` currently defines `DRIVE` (style → core-drive
copy) and `buildHistoryContext` (visit history → prompt context) as private
module functions. The new voice-partner routes need both. Extract to a
shared module rather than duplicating — both the opening-line and
turn-judging prompts need `DRIVE`, and `buildHistoryContext` is copied
verbatim from the existing function.

**Files:**
- Create: `src/lib/doctor-context.ts`
- Test: `src/lib/doctor-context.test.ts`
- Modify: `src/app/api/generate-scenario/route.ts`

**Interfaces:**
- Produces: `DRIVE: Record<StyleKey, string>`,
  `buildHistoryContext(visits: DoctorVisit[]): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/doctor-context.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DRIVE, buildHistoryContext } from './doctor-context'
import type { DoctorVisit } from '@/types/game'

function visit(overrides: Partial<DoctorVisit>): DoctorVisit {
  return {
    id: 'v1', doctor_id: 'd1', rep_id: 'r1', source: 'manual',
    objection_raised: null, promise_made: null, what_worked: null, note: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('DRIVE', () => {
  it('has copy for all four styles', () => {
    expect(Object.keys(DRIVE).sort()).toEqual(['amiable', 'analytical', 'driver', 'expressive'])
  })
})

describe('buildHistoryContext', () => {
  it('returns empty string for no visits', () => {
    expect(buildHistoryContext([])).toBe('')
  })

  it('formats objection/promise/what-worked fields into a bulleted context block', () => {
    const ctx = buildHistoryContext([
      visit({ objection_raised: 'too expensive', promise_made: 'sample pack next visit', what_worked: 'led with safety data' }),
    ])
    expect(ctx).toContain('objection: "too expensive"')
    expect(ctx).toContain('rep promised: "sample pack next visit"')
    expect(ctx).toContain('worked well: "led with safety data"')
    expect(ctx).toContain('Past visit history with this doctor')
  })

  it('falls back to the general note when no structured fields are set', () => {
    const ctx = buildHistoryContext([visit({ note: 'quick hallway chat, no real objection' })])
    expect(ctx).toContain('quick hallway chat, no real objection')
  })

  it('only uses the 5 most recent visits', () => {
    const visits = Array.from({ length: 8 }, (_, i) => visit({ objection_raised: `objection-${i}` }))
    const ctx = buildHistoryContext(visits)
    expect(ctx).toContain('objection-0')
    expect(ctx).toContain('objection-4')
    expect(ctx).not.toContain('objection-5')
  })

  it('returns empty string when every visit has no usable fields', () => {
    expect(buildHistoryContext([visit({})])).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/doctor-context.test.ts`
Expected: FAIL — `Cannot find module './doctor-context'`

- [ ] **Step 3: Create the module**

Create `src/lib/doctor-context.ts`:

```ts
import type { DoctorVisit, StyleKey } from '@/types/game'

// Core drive per social style — shared doctor-persona copy used by every
// AI-generated doctor voice: the bespoke drill (generate-scenario) and the
// AI voice partner (open/turn).
export const DRIVE: Record<StyleKey, string> = {
  driver: 'Control & Achievement',
  expressive: 'Recognition & Ideas',
  amiable: 'Security & Harmony',
  analytical: 'Certainty & Accuracy',
}

// Turns a doctor's visit history into "the rep already knows this" context so
// a generated scenario or conversation echoes real objections/promises
// instead of generic style theory.
export function buildHistoryContext(visits: DoctorVisit[]): string {
  if (!visits.length) return ''
  const lines = visits.slice(0, 5).map(v => {
    const parts: string[] = []
    if (v.objection_raised) parts.push(`objection: "${v.objection_raised}"`)
    if (v.promise_made) parts.push(`rep promised: "${v.promise_made}"`)
    if (v.what_worked) parts.push(`worked well: "${v.what_worked}"`)
    if (!parts.length && v.note) parts.push(v.note)
    return parts.length ? `- ${parts.join('; ')}` : null
  }).filter((l): l is string => l !== null)
  if (!lines.length) return ''
  return `Past visit history with this doctor (most recent first) — use this to make the objection feel like a continuation, not a first meeting:\n${lines.join('\n')}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/doctor-context.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Refactor `generate-scenario/route.ts` to use the shared module**

In `src/app/api/generate-scenario/route.ts`, remove the local `DRIVE` const
and `buildHistoryContext` function (they are currently defined near the top
of the file, before `buildUserPrompt`), and add to the imports at the top:

```ts
import { DRIVE, buildHistoryContext } from '@/lib/doctor-context'
```

The rest of the file (`buildUserPrompt`, `parseScenario`, `POST`) is
unchanged — it already calls `DRIVE[style]` and `buildHistoryContext(...)`
by name, so removing the local definitions and importing the same names is
a pure refactor.

- [ ] **Step 6: Typecheck + run the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all existing tests still pass (this refactor doesn't
touch `generate-scenario`'s runtime behavior).

- [ ] **Step 7: Commit**

```bash
git add src/lib/doctor-context.ts src/lib/doctor-context.test.ts src/app/api/generate-scenario/route.ts
git commit -m "refactor: extract DRIVE + buildHistoryContext into shared doctor-context module"
```

---

### Task 3: Pure logic module (`voice-partner-core.ts`)

The prompt-building, response-parsing, and turn-resolution logic, kept as
pure functions so they're testable without hitting any upstream API —
mirrors the `roleplay-core.ts` / `champions-core.ts` pattern already used
elsewhere in this codebase.

**Files:**
- Create: `src/lib/voice-partner-core.ts`
- Test: `src/lib/voice-partner-core.test.ts`

**Interfaces:**
- Consumes: `DRIVE` from `@/lib/doctor-context` (Task 2); `StyleKey` from
  `@/types/game`.
- Produces: `SYSTEM: string`, `TURN_CAP: 5`,
  `VoicePartnerTurn = { role: 'doctor' | 'rep'; text: string }`,
  `VoicePartnerVerdict = 'win' | 'escalate' | 'continue'`,
  `TurnOutcome = 'continue' | 'won' | 'escalated'`,
  `buildOpeningPrompt(name, style, lang, historyContext): string`,
  `parseOpeningResponse(text): string | null`,
  `buildJudgePrompt(name, style, lang, historyContext, turns, repReply, turnCount): string`,
  `parseJudgeResponse(text): { verdict: VoicePartnerVerdict; doctorReply: string } | null`,
  `resolveTurn(turnCount: number, verdict: VoicePartnerVerdict): TurnOutcome`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice-partner-core.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  type VoicePartnerTurn,
} from './voice-partner-core'

describe('resolveTurn', () => {
  it('resolves "won" whenever the model verdict is win, regardless of turn count', () => {
    expect(resolveTurn(1, 'win')).toBe('won')
    expect(resolveTurn(5, 'win')).toBe('won')
  })

  it('resolves "escalated" whenever the model verdict is escalate', () => {
    expect(resolveTurn(1, 'escalate')).toBe('escalated')
  })

  it('resolves "continue" when the model says continue and the turn cap is not reached', () => {
    expect(resolveTurn(1, 'continue')).toBe('continue')
    expect(resolveTurn(TURN_CAP - 1, 'continue')).toBe('continue')
  })

  it('forces "escalated" when the model says continue but the turn cap is reached', () => {
    expect(resolveTurn(TURN_CAP, 'continue')).toBe('escalated')
    expect(resolveTurn(TURN_CAP + 1, 'continue')).toBe('escalated')
  })
})

describe('buildOpeningPrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildOpeningPrompt('Dr. Amina', 'analytical', 'en', '')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildOpeningPrompt('Dr. Amina', 'driver', 'en', 'Past visit history with this doctor: objection about price')
    expect(prompt).toContain('objection about price')
  })
})

describe('parseOpeningResponse', () => {
  it('parses a valid JSON opening line', () => {
    expect(parseOpeningResponse('{"doctorText":"Your product costs too much."}')).toBe('Your product costs too much.')
  })

  it('strips surrounding commentary/markdown fences', () => {
    expect(parseOpeningResponse('```json\n{"doctorText":"Too expensive."}\n```')).toBe('Too expensive.')
  })

  it('returns null for malformed JSON', () => {
    expect(parseOpeningResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseOpeningResponse('{"doctorText":""}')).toBeNull()
    expect(parseOpeningResponse('{}')).toBeNull()
  })
})

describe('buildJudgePrompt', () => {
  const turns: VoicePartnerTurn[] = [{ role: 'doctor', text: 'Your product costs too much.' }]

  it('includes the transcript so far, the new rep reply, and the turn count/cap', () => {
    const prompt = buildJudgePrompt('Dr. Amina', 'driver', 'en', '', turns, 'It pays for itself within a month.', 1)
    expect(prompt).toContain('Doctor: Your product costs too much.')
    expect(prompt).toContain('It pays for itself within a month.')
    expect(prompt).toContain(`rep reply #1 of a maximum ${TURN_CAP}`)
  })

  it('marks the opening turn explicitly when there is no prior transcript', () => {
    const prompt = buildJudgePrompt('Dr. Amina', 'driver', 'en', '', [], 'first reply', 1)
    expect(prompt).toContain('the rep has not spoken yet')
  })
})

describe('parseJudgeResponse', () => {
  it('parses a valid verdict + reply', () => {
    const parsed = parseJudgeResponse('{"verdict":"continue","doctorReply":"Convince me further."}')
    expect(parsed).toEqual({ verdict: 'continue', doctorReply: 'Convince me further.' })
  })

  it('accepts win and escalate verdicts', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough."}')?.verdict).toBe('win')
    expect(parseJudgeResponse('{"verdict":"escalate","doctorReply":"Not interested."}')?.verdict).toBe('escalate')
  })

  it('returns null for an invalid verdict value', () => {
    expect(parseJudgeResponse('{"verdict":"maybe","doctorReply":"..."}')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorReply is missing or empty', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":""}')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice-partner-core.test.ts`
Expected: FAIL — `Cannot find module './voice-partner-core'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice-partner-core.ts`:

```ts
import type { StyleKey } from '@/types/game'
import { DRIVE } from '@/lib/doctor-context'

export const TURN_CAP = 5

export type VoicePartnerTurn = { role: 'doctor' | 'rep'; text: string }
export type VoicePartnerVerdict = 'win' | 'escalate' | 'continue'
export type TurnOutcome = 'continue' | 'won' | 'escalated'

// Hard guardrail shared by both the opening line and every judged reply —
// same rules as generate-scenario's SYSTEM prompt, extended for a
// multi-turn in-character conversation instead of a single scenario.
export const SYSTEM = `You are role-playing as a pharmaceutical doctor/customer during a sales rep's practice conversation. The rep is training to adapt their SOCIAL STYLE communication (Driver, Expressive, Amiable, Analytical) to this doctor's style.

Hard rules — follow exactly:
- NEVER invent clinical data, efficacy numbers, statistics, trial results, study names, dosages, or real/branded drug names.
- Refer to the product only as "your product"; refer to evidence generically ("the trial data", "the evidence pack", "the safety profile").
- Every reply must stay in character as the doctor — never break character to explain scoring or coach the rep directly.
- Judge the rep's most recent reply on its own merits: adjust resistance based on argument quality — don't concede to a weak reply, don't stonewall a strong one.
- Output ONLY a single valid JSON object. No markdown fences, no commentary.`

function langName(lang: 'en' | 'ar'): string {
  return lang === 'ar' ? 'Arabic' : 'English'
}

export function buildOpeningPrompt(name: string, style: StyleKey, lang: 'en' | 'ar', historyContext: string): string {
  return `You are ${name}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${historyContext}

Open the conversation with a short objection about "your product" — the opening resistance the rep needs to work through, in your own voice, 1-2 sentences.

Return JSON exactly in this shape:
{"doctorText": "your opening objection"}`
}

export function parseOpeningResponse(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  return o.doctorText
}

export function buildJudgePrompt(
  name: string, style: StyleKey, lang: 'en' | 'ar', historyContext: string,
  turns: VoicePartnerTurn[], repReply: string, turnCount: number,
): string {
  const transcript = turns.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `You are ${name}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${historyContext}

Conversation so far:
${transcript || '(this is the opening line — the rep has not spoken yet)'}
Rep: ${repReply}

This is rep reply #${turnCount} of a maximum ${TURN_CAP}. Judge this reply and respond as the doctor.

Return JSON exactly in this shape:
{
  "verdict": "win" | "escalate" | "continue",
  "doctorReply": "your in-character spoken reply, 1-3 sentences"
}
"win" = the rep's reply resolves your objection convincingly, end the conversation satisfied.
"escalate" = the rep's reply is weak or off-target and you're done listening, end the conversation unsatisfied.
"continue" = the reply is reasonable but you still have more resistance to raise — keep pushing.`
}

export function parseJudgeResponse(text: string): { verdict: VoicePartnerVerdict; doctorReply: string } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorReply !== 'string' || !o.doctorReply.trim()) return null
  if (o.verdict !== 'win' && o.verdict !== 'escalate' && o.verdict !== 'continue') return null
  return { verdict: o.verdict, doctorReply: o.doctorReply }
}

/** Pure turn-cap enforcement: the model's own verdict wins/escalates the
 * session outright; a "continue" verdict is overridden to "escalated" once
 * turnCount has reached TURN_CAP, regardless of what the model said. */
export function resolveTurn(turnCount: number, verdict: VoicePartnerVerdict): TurnOutcome {
  if (verdict === 'win') return 'won'
  if (verdict === 'escalate') return 'escalated'
  return turnCount >= TURN_CAP ? 'escalated' : 'continue'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice-partner-core.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice-partner-core.ts src/lib/voice-partner-core.test.ts
git commit -m "feat: add voice-partner-core pure logic (prompts, parsers, turn resolution)"
```

---

### Task 4: `/api/voice-partner/speak` route (TTS)

The narrowest of the three routes — text in, audio out. Used by the client
to voice both the opening line (from `/open`) and every doctor reply (from
`/turn`).

**Files:**
- Create: `src/app/api/voice-partner/speak/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone upstream call).
- Produces: `POST /api/voice-partner/speak` — body `{ text: string }` →
  `200 { audio: string }` (base64 MP3) | `503 {error:'not_configured'}` |
  `401 {error:'unauthorized'}` | `400 {error:'bad_request'}` |
  `502 {error:'upstream'}`.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/speak/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const VOICE = 'onyx'

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !apiKey || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { text?: string }
  if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOICE, input: body.text }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const buf = await res.arrayBuffer()
  const audio = Buffer.from(buf).toString('base64')
  return NextResponse.json({ audio })
}
```

Note: the flag check requires both `OPENAI_API_KEY` (used here) and
`ANTHROPIC_API_KEY` (used by the other two routes) so that "AI Voice
Partner" reads as a single on/off feature to whoever configures Netlify env
vars, rather than three routes that can be half-configured independently.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

With `AI_VOICE_PARTNER_ENABLED` unset locally, run the dev server
(`npm run dev`) and:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/voice-partner/speak \
  -H 'content-type: application/json' -d '{"text":"hello"}'
```

Expected: `503` (flag off). Full round-trip verification (flag on, audio
plays) happens in Task 10 once the client exists to consume it.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/voice-partner/speak/route.ts
git commit -m "feat: add voice-partner speak route (OpenAI TTS)"
```

---

### Task 5: `/api/voice-partner/open` route (opening line)

**Files:**
- Create: `src/app/api/voice-partner/open/route.ts`

**Interfaces:**
- Consumes: `buildOpeningPrompt`, `parseOpeningResponse`, `SYSTEM` from
  `@/lib/voice-partner-core` (Task 3); `buildHistoryContext` from
  `@/lib/doctor-context` (Task 2).
- Produces: `POST /api/voice-partner/open` — body `{ doctorId: string, lang: 'en'|'ar' }`
  → `200 { doctorText: string }` | `503` | `401` | `400 {error:'bad_request'}` |
  `404 {error:'not_found'}` | `422 {error:'no_style'}` | `502 {error:'upstream'}`.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/open/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, buildOpeningPrompt, parseOpeningResponse } from '@/lib/voice-partner-core'
import type { Doctor, DoctorVisit } from '@/types/game'

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { doctorId?: string; lang?: 'en' | 'ar' }
  if (!body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const lang = body.lang === 'ar' ? 'ar' : 'en'

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', body.doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildOpeningPrompt((doctor as Doctor).name, style, lang, historyContext) }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const doctorText = parseOpeningResponse(data?.content?.[0]?.text ?? '')
  if (!doctorText) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ doctorText })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice-partner/open/route.ts
git commit -m "feat: add voice-partner open route (opening objection line)"
```

---

### Task 6: `/api/voice-partner/turn` route (STT + judge)

**Files:**
- Create: `src/app/api/voice-partner/turn/route.ts`

**Interfaces:**
- Consumes: `buildJudgePrompt`, `parseJudgeResponse`, `resolveTurn`, `SYSTEM`,
  `VoicePartnerTurn` from `@/lib/voice-partner-core` (Task 3);
  `buildHistoryContext` from `@/lib/doctor-context` (Task 2).
- Produces: `POST /api/voice-partner/turn` — multipart form body
  (`doctorId: string`, `lang: 'en'|'ar'`, `history: string` [JSON-encoded
  `VoicePartnerTurn[]`], `audio: File`) →
  `200 { repText: string; doctorText: string; outcome: TurnOutcome; turnCount: number }`
  | `503` | `401` | `400 {error:'bad_request'}` | `404` | `422 {error:'no_style'}`
  | `502 {error:'upstream'}`.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/turn/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, buildJudgePrompt, parseJudgeResponse, resolveTurn, type VoicePartnerTurn } from '@/lib/voice-partner-core'
import type { Doctor, DoctorVisit } from '@/types/game'

async function transcribe(audio: Blob, apiKey: string): Promise<string | null> {
  const form = new FormData()
  form.append('file', audio, 'turn.webm')
  form.append('model', 'whisper-1')
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch { return null }
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { text?: string } | null
  return data?.text?.trim() || null
}

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !openaiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const doctorId = form.get('doctorId')
  const lang = form.get('lang') === 'ar' ? 'ar' : 'en'
  const historyRaw = form.get('history')
  const audio = form.get('audio')
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  let history: VoicePartnerTurn[] = []
  if (typeof historyRaw === 'string') {
    try { history = JSON.parse(historyRaw) } catch { history = [] }
  }

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  const repText = await transcribe(audio, openaiKey)
  if (!repText) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const turnCount = history.filter(h => h.role === 'rep').length + 1
  const prompt = buildJudgePrompt((doctor as Doctor).name, style, lang, historyContext, history, repText, turnCount)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const judged = parseJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  const outcome = resolveTurn(turnCount, judged.verdict)

  return NextResponse.json({ repText, doctorText: judged.doctorReply, outcome, turnCount })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice-partner/turn/route.ts
git commit -m "feat: add voice-partner turn route (Whisper STT + Claude judge)"
```

---

### Task 7: i18n keys (EN + AR)

**Files:**
- Modify: `src/lib/i18n.tsx`

- [ ] **Step 1: Add EN keys**

In `src/lib/i18n.tsx`, in the `EN` dict, near the existing `visit.*` block
(after `visit.micNotConfigured`, around line 281), add:

```ts
  'visit.sourceVoicePartner': 'AI voice partner',
  'visit.voicePartnerNote': 'AI voice partner · resolved in {turns} turns · {outcome}',
  'voice.entryButton': '🎙️ Practice Out Loud',
  'voice.premium': 'Premium',
  'voice.notConfigured': 'Launching soon — coming to your account.',
  'voice.teaser': "This premium feature lets you rehearse out loud against an AI voiced as {name} — speak your response and hear how they push back, adapting to what you actually say.",
  'voice.connecting': 'Connecting…',
  'voice.listening': 'Listening…',
  'voice.thinking': 'Thinking…',
  'voice.speaking': 'Speaking…',
  'voice.tapToSpeak': 'Tap to speak',
  'voice.turnCounter': 'Turn {n} of {max}',
  'voice.error': "Something went wrong — try that again.",
  'voice.won': 'Objection resolved',
  'voice.escalated': 'The doctor moved on',
  'voice.back': '← Back',
```

Near the existing `SOURCE_LABEL_KEY`-adjacent copy is in `VisitPrep.tsx`,
not `i18n.tsx` — the source label key itself
(`visit.sourceVoicePartner`, above) is the only i18n entry that feeds it.

- [ ] **Step 2: Add matching AR keys**

In the `AR` dict (starting at line 362), near the mirrored `visit.*` block
(after `visit.micNotConfigured`, around line 613), add:

```ts
  'visit.sourceVoicePartner': 'شريك صوتي بالذكاء',
  'visit.voicePartnerNote': 'شريك صوتي بالذكاء · انتهى خلال {turns} جولات · {outcome}',
  'voice.entryButton': '🎙️ تدرّب بصوت مسموع',
  'voice.premium': 'مميّز',
  'voice.notConfigured': 'سيُطلق قريباً — قادم إلى حسابك.',
  'voice.teaser': 'تتيح لك هذه الميزة المميّزة التدرّب بصوت مسموع أمام ذكاء اصطناعي يتحدث بصوت {name} — تحدّث بردّك واستمع لكيفية اعتراضه، متكيّفاً مع ما تقوله فعلاً.',
  'voice.connecting': 'جارِ الاتصال…',
  'voice.listening': 'جارِ الاستماع…',
  'voice.thinking': 'جارِ التفكير…',
  'voice.speaking': 'يتحدّث…',
  'voice.tapToSpeak': 'اضغط للتحدث',
  'voice.turnCounter': 'الجولة {n} من {max}',
  'voice.error': 'حدث خطأ ما — حاول مرة أخرى.',
  'voice.won': 'تم تجاوز الاعتراض',
  'voice.escalated': 'انتقل الطبيب إلى موضوع آخر',
  'voice.back': '← رجوع',
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (both `EN` and `AR` are typed `Dict = Record<string,
string>`, so any key shape is valid — this step just confirms no syntax
errors in the edit).

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: add EN/AR copy for AI voice partner"
```

---

### Task 8: `useVoicePartner` hook

**Files:**
- Create: `src/hooks/useVoicePartner.ts`

**Interfaces:**
- Consumes: `VoicePartnerTurn`, `TurnOutcome` from `@/lib/voice-partner-core`
  (Task 3); `XP_VALUES` from `@/lib/game-data` (Task 1);
  `createClient` from `@/lib/supabase-browser`.
- Produces:
  `usePhase = 'idle' | 'opening' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error'`;
  `useVoicePartner(doctorId: string, lang: 'en'|'ar')` returning
  `{ phase, transcript: VoicePartnerTurn[], turnCount, outcome, openingText,
  startVoicePartner, startRecording, stopRecording, reset }`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useVoicePartner.ts`:

```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { XP_VALUES } from '@/lib/game-data'
import type { VoicePartnerTurn, TurnOutcome } from '@/lib/voice-partner-core'

export type VoicePartnerPhase =
  | 'idle' | 'opening' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error'

async function speak(text: string): Promise<string | null> {
  const res = await fetch('/api/voice-partner/speak', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { audio?: string } | null
  return data?.audio ?? null
}

function playBase64Audio(base64: string): Promise<void> {
  return new Promise(resolve => {
    const audio = new Audio(`data:audio/mp3;base64,${base64}`)
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    void audio.play().catch(() => resolve())
  })
}

export function useVoicePartner(doctorId: string, lang: 'en' | 'ar') {
  const supabase = createClient()
  const [phase, setPhase] = useState<VoicePartnerPhase>('idle')
  const [transcript, setTranscript] = useState<VoicePartnerTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null)
  const [openingText, setOpeningText] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startVoicePartner = useCallback(async () => {
    setPhase('opening')
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    try {
      const res = await fetch('/api/voice-partner/open', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang }),
      })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as { doctorText?: string } | null
      if (!data?.doctorText) { setPhase('error'); return }
      setOpeningText(data.doctorText)
      setTranscript([{ role: 'doctor', text: data.doctorText }])

      const audio = await speak(data.doctorText)
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecRef.current = rec
      rec.start()
      setPhase('recording')
    } catch {
      setPhase('error')
    }
  }, [])

  const awardXpOnWin = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile, error: profileError } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
    if (profileError || !profile) return
    const { error: xpError } = await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.voicePartnerWin }).eq('id', user.id)
    if (xpError) console.error('voice partner xp update failed:', xpError.message)
  }, [supabase])

  const stopRecording = useCallback(async () => {
    const rec = mediaRecRef.current
    if (!rec) return
    setPhase('sending')

    const blob: Blob = await new Promise(resolve => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
      rec.stop()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    try {
      const form = new FormData()
      form.append('doctorId', doctorId)
      form.append('lang', lang)
      form.append('history', JSON.stringify(transcript))
      form.append('audio', blob, 'turn.webm')

      const res = await fetch('/api/voice-partner/turn', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as {
        repText?: string; doctorText?: string; outcome?: TurnOutcome; turnCount?: number
      } | null
      if (!data?.repText || !data.doctorText || !data.outcome) { setPhase('error'); return }

      const nextTranscript: VoicePartnerTurn[] = [
        ...transcript, { role: 'rep', text: data.repText }, { role: 'doctor', text: data.doctorText },
      ]
      setTranscript(nextTranscript)
      setTurnCount(data.turnCount ?? turnCount + 1)
      setOutcome(data.outcome)

      const audio = await speak(data.doctorText)
      setPhase('playing')
      if (audio) await playBase64Audio(audio)

      if (data.outcome === 'won') await awardXpOnWin()
      setPhase('idle')
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang, transcript, turnCount, awardXpOnWin])

  const reset = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setPhase('idle')
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setOpeningText('')
  }, [])

  return { phase, transcript, turnCount, outcome, openingText, startVoicePartner, startRecording, stopRecording, reset }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVoicePartner.ts
git commit -m "feat: add useVoicePartner hook"
```

---

### Task 9: `VoicePartner.tsx` component

**Files:**
- Create: `src/components/game/VoicePartner.tsx`

**Interfaces:**
- Consumes: `useVoicePartner` (Task 8); `Feedback` from `./helpers`; `Doctor`
  from `@/types/game`.
- Produces: `<VoicePartner doctor={Doctor} onDone={(won: boolean, meta: { turns: number; openingCrisis: string }) => void} />`

- [ ] **Step 1: Write the component**

Create `src/components/game/VoicePartner.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoicePartner } from '@/hooks/useVoicePartner'
import { TURN_CAP } from '@/lib/voice-partner-core'
import { Feedback } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function VoicePartner({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, transcript, turnCount, outcome, openingText, startVoicePartner, startRecording, stopRecording, reset } = useVoicePartner(doctor.id, lang)

  useEffect(() => { void startVoicePartner() }, [startVoicePartner])

  const style = doctor.style
  const s = style ? STYLES[style] : null
  const c = style ? COLOR[style] : 'var(--ink-dim)'

  if (phase === 'notconfigured') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voice.premium')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voice.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'opening' ? t('voice.connecting') :
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('voice.turnCounter', { n: turnCount, max: TURN_CAP })}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 320, overflowY: 'auto' }}>
          {transcript.map((turn, i) => (
            <div key={i} style={{
              alignSelf: turn.role === 'doctor' ? 'flex-start' : 'flex-end',
              maxWidth: '85%', borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5,
              background: turn.role === 'doctor' ? 'rgba(0,0,0,.25)' : 'rgba(62,224,143,.1)',
              border: `1px solid ${turn.role === 'doctor' ? 'var(--line)' : 'var(--green)'}`,
            }}>
              {turn.text}
            </div>
          ))}
        </div>

        {!outcome && (
          <button
            onClick={phase === 'recording' ? stopRecording : startRecording}
            disabled={phase === 'opening' || phase === 'sending' || phase === 'playing'}
            style={{
              width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase',
              border: `1px solid ${phase === 'recording' ? 'var(--red)' : 'var(--cyan)'}`,
              color: phase === 'recording' ? 'var(--red)' : '#04121c',
              background: phase === 'recording' ? 'rgba(255,80,80,.08)' : 'var(--cyan)',
              borderRadius: 10, padding: '14px 18px', touchAction: 'manipulation',
              opacity: (phase === 'opening' || phase === 'sending' || phase === 'playing') ? 0.6 : 1,
            }}
          >
            🎙️ {label}
          </button>
        )}

        {outcome && outcome !== 'continue' && (
          <>
            <Feedback ok={outcome === 'won'} title={outcome === 'won' ? t('voice.won') : t('voice.escalated')} body="" />
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => onDone(outcome === 'won', { turns: turnCount, openingCrisis: openingText })}
                style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }}
              >
                {t('result.logContinue')}
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <button onClick={reset} style={{ ...ghostBtn, marginTop: 10 }}>{t('voice.back')}</button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/game/VoicePartner.tsx
git commit -m "feat: add VoicePartner component"
```

---

### Task 10: Wire into `VisitPrep.tsx` + end-to-end verification

**Files:**
- Modify: `src/components/game/VisitPrep.tsx`

**Interfaces:**
- Consumes: `VoicePartner` (Task 9); `useDoctorVisits` (existing).

- [ ] **Step 1: Add the `'voice'` view mode**

In `src/components/game/VisitPrep.tsx`, add to the imports:

```ts
import VoicePartner from './VoicePartner'
```

In the `View` union (around line 21-28), add:

```ts
  | { mode: 'voice'; doctor: Doctor }
```

After the existing `roleplay` mode block (around line 80-82), add:

```ts
  // ───────────────────────── AI VOICE PARTNER ─────────────────────────
  if (view.mode === 'voice') {
    return <VoicePartnerScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 2: Add the local wrapper (owns `addVisit`, mirrors `AiDrill`)**

Near the existing `AiDrill` function (around line 384-445), add a new
function immediately after it:

```tsx
// ───────────────────────── AI voice partner wrapper (owns doctor_visits logging) ─────────────────────────
function VoicePartnerScreen({ doctor, onDone }: { doctor: Doctor; onDone: () => void }) {
  const t = useT()
  const { addVisit } = useDoctorVisits(doctor.id)

  return (
    <VoicePartner
      doctor={doctor}
      onDone={(won, meta) => {
        if (meta.turns > 0) {
          void addVisit({
            source: 'voice_partner',
            objection_raised: meta.openingCrisis || null,
            note: t('visit.voicePartnerNote', { turns: meta.turns, outcome: won ? t('visit.aiDrillWin') : t('visit.aiDrillEscalate') }),
          })
        }
        onDone()
      }}
    />
  )
}
```

The `meta.turns > 0` guard skips logging when the rep backs out from the
"coming soon" teaser without ever recording a turn (matching `AiDrill`,
which only logs once `onDone` fires from inside `GeneratedDrill` after a
real answer, never from the teaser's own back button).

- [ ] **Step 3: Add the entry button on the doctor detail screen**

In the detail screen's cheat-sheet panel (around line 138-141, right after
the existing roleplay button), add:

```tsx
            <button onClick={() => setView({ mode: 'voice', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('voice.entryButton')} · {t('voice.premium')}
            </button>
```

- [ ] **Step 4: Add the `voice_partner` source label**

Find `SOURCE_LABEL_KEY` (around line 448-450):

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill',
}
```

Change to:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill',
  voice_partner: 'visit.sourceVoicePartner',
}
```

(TypeScript will already have caught a missing key here at compile time
once Task 1 extended `DoctorVisit['source']` — this step is what fixes
that error.)

- [ ] **Step 5: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 6: Manual verification — flag off**

Run `npm run dev`, sign in as a rep with at least one doctor whose style is
set. Open that doctor's detail screen, tap "🎙️ Practice Out Loud · Premium".
Expected: teaser screen renders (`voice.teaser` copy with the doctor's
name interpolated), back button returns to detail screen, no
`doctor_visits` row was created (check via `DoctorHistory` panel — no new
"AI voice partner" entry).

- [ ] **Step 7: Manual verification — flag on, full round trip**

Set locally (`.env.local`): `AI_VOICE_PARTNER_ENABLED=true`,
`ANTHROPIC_API_KEY=<real key>`, `OPENAI_API_KEY=<real key>`. Restart dev
server. Repeat the entry flow:

- Confirm the opening line appears as a doctor bubble and plays as audio.
- Tap the mic, speak a weak/dismissive reply, release. Confirm a rep bubble
  (transcribed text) and a new doctor bubble appear, audio plays, turn
  counter increments.
- Repeat with a strong, well-reasoned reply until the session resolves
  `won` (or run 5 turns to confirm the hard cap forces `escalated` even if
  the model keeps returning `continue`).
- On `won`: confirm `profiles.xp` increased by 40 (check via Supabase MCP
  `execute_sql` or the game-home XP display) and a `doctor_visits` row was
  created with `source='voice_partner'`.
- Switch the app to Arabic, repeat the opening line only, confirm the
  doctor's line and audio are in Arabic. **If OpenAI TTS Arabic output is
  poor quality (garbled, wrong pronunciation), note this — the spec calls
  out that Arabic voice quality is unverified until built and permits an
  English-only fallback if needed. Do not silently ship broken Arabic
  audio; flag it back to the spec owner if quality is poor.**
- Spot-check 3-4 generated doctor lines (opening + judged replies) for
  guardrail violations — no invented drug names, efficacy numbers, or
  clinical claims. Report any violation found; do not consider this task
  done if the guardrail is leaking.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/VisitPrep.tsx
git commit -m "feat: wire AI voice partner into doctor detail screen"
```
