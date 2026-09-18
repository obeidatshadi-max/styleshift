# Realtime Voice Partner Client Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give reps a working UI to start a live, spoken (Daily/Pipecat) practice call against the already-deployed voice-partner agent, and score it the same way the 5 existing turn-based modes are scored.

**Architecture:** New 6th VisitPrep mode, fully additive — no changes to the 5 existing turn-based voice-partner components. A new `useVoiceLive` hook joins the Daily room `/api/pipecat/session` (existing, unchanged) already returns, using `@pipecat-ai/client-js`. On call end, a new one-shot `/api/voice-partner/live-judge` route scores the full transcript and hands the result to the *existing, unchanged* `/api/voice-partner/session-result` save path.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres + RLS), Vitest, `@pipecat-ai/client-js` + `@pipecat-ai/daily-transport` (new), Anthropic Claude Haiku (existing judge pattern).

**Spec:** `docs/superpowers/specs/2026-09-18-voice-partner-realtime-client-design.md`

## Global Constraints

- No `doctor_visits` insert from the new API route — that write happens client-side via the existing `useDoctorVisits().addVisit()` pattern in a `VisitPrep.tsx` wrapper component, exactly like the 5 existing modes (`VoicePartnerScreen` etc., `VisitPrep.tsx` lines ~677-696). Do not duplicate this insert server-side.
- Reuse `/api/voice-partner/session-result` and its exact input contract unchanged (`doctorId`, `objectionType`, `outcome`, `clearSteps`, `turnCount`, optional `sessionId`/`difficulty`) — do not modify that route.
- Reuse `voice-partner-core.ts`'s existing exports (`ObjectionType`, `isObjectionType`, `ClearStep`, `isClearStep`, `CLEAR_STEPS`, `personaLines`, `SYSTEM`, `TURN_CAP`, `DIFFICULTY_LEVELS`, `DEFAULT_DIFFICULTY`, `Difficulty`) — do not redefine these types.
- New Arabic (`ar`) i18n strings must be verified by re-reading the file with the Read tool after writing (visually confirm real Arabic characters, not `?` placeholders) before commit — see Task 6.
- `AI_VOICE_PARTNER_LIVE_ENABLED` is a new, separate flag from the existing `AI_VOICE_PARTNER_ENABLED` (which gates only the 5 turn-based modes).
- This repo's Next.js version has documented breaking changes vs. training data (see `AGENTS.md`) — check `node_modules/next/dist/docs/` before writing anything Next-API-specific. The same caution applies to `@pipecat-ai/client-js`, a fast-moving package: Task 5 requires inspecting the actually-installed package's type definitions before writing hook code, not assuming a remembered API shape.

---

## Task 1: Database migration — new `doctor_visits` source value

**Files:**
- Create: `supabase/migrations/030_voice_partner_live_source.sql`
- Modify: `src/types/game.ts:116` (the `DoctorVisit['source']` union)

**Interfaces:**
- Produces: `doctor_visits.source` accepts `'voice_partner_live'` as a 9th value (existing 8: `manual | warmup | ai_drill | voice_partner | voice_partner_opening | voice_partner_question | voice_partner_fab | voice_partner_closing`).

- [ ] **Step 1: Write the migration**

```sql
-- 030_voice_partner_live_source.sql
alter table public.doctor_visits drop constraint if exists doctor_visits_source_check;
alter table public.doctor_visits add constraint doctor_visits_source_check
  check (source = any (array[
    'manual','warmup','ai_drill',
    'voice_partner','voice_partner_opening','voice_partner_question','voice_partner_fab','voice_partner_closing',
    'voice_partner_live'
  ]));
```

- [ ] **Step 2: Apply it via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool against project `cnlloaihrrmattuidpeh`, name `030_voice_partner_live_source`, with the SQL above as `query`. This repo's local `supabase/migrations/` has previously gone stale vs. remote (see `project_styleshift` memory) — remote (applied via MCP) is the source of truth; still commit the local `.sql` file for a readable history.

- [ ] **Step 3: Verify the constraint**

Use `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'doctor_visits_source_check';
```
Expected: the definition string includes `'voice_partner_live'`.

- [ ] **Step 4: Update the TypeScript union**

In `src/types/game.ts`, change line 116 from:
```typescript
source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question' | 'voice_partner_fab' | 'voice_partner_closing'
```
to:
```typescript
source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question' | 'voice_partner_fab' | 'voice_partner_closing' | 'voice_partner_live'
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/030_voice_partner_live_source.sql src/types/game.ts
git commit -m "feat: add voice_partner_live doctor_visits source"
```

---

## Task 2: Pure scoring core — `voice-live-core.ts`

**Files:**
- Create: `src/lib/voice-live-core.ts`
- Test: `src/lib/voice-live-core.test.ts`

**Interfaces:**
- Consumes: `ObjectionType`, `isObjectionType`, `ClearStep`, `isClearStep`, `personaLines` from `@/lib/voice-partner-core`; `Doctor`, `StyleKey` from `@/types/game`.
- Produces (used by Task 3): `LiveTranscriptTurn`, `shouldSkipJudge(transcript)`, `buildLiveJudgePrompt(doctor, style, lang, transcript)`, `parseLiveJudgeResponse(text)`, `ConversationTurnRow`, `transcriptToConversationTurns(transcript, ctx)`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/voice-live-core.test.ts
import { describe, expect, it } from 'vitest'
import { shouldSkipJudge, buildLiveJudgePrompt, parseLiveJudgeResponse, transcriptToConversationTurns, type LiveTranscriptTurn } from './voice-live-core'
import type { Doctor } from '@/types/game'

const doctor: Doctor = {
  id: 'd1', rep_id: 'r1', name: 'Dr. Sara', specialty: 'cardiology', style: 'driver',
  key_phrases: [], objections: ['too busy'], objection_notes: null, hidden_concern: null,
  product_context: null, meeting_stage: null, created_at: '', updated_at: '',
} as unknown as Doctor

describe('shouldSkipJudge', () => {
  it('skips when no rep turns exist', () => {
    expect(shouldSkipJudge([])).toBe(true)
    expect(shouldSkipJudge([{ role: 'doctor', text: 'Hi' }])).toBe(true)
  })
  it('does not skip once the rep has spoken', () => {
    expect(shouldSkipJudge([{ role: 'doctor', text: 'Hi' }, { role: 'rep', text: 'Hello doctor' }])).toBe(false)
  })
})

describe('buildLiveJudgePrompt', () => {
  it('includes the full transcript and both objection-type and clear-step instructions', () => {
    const transcript: LiveTranscriptTurn[] = [
      { role: 'doctor', text: 'I am too busy for this.' },
      { role: 'rep', text: 'I understand — what specifically is eating your time?' },
    ]
    const prompt = buildLiveJudgePrompt(doctor, 'driver', 'en', transcript)
    expect(prompt).toContain('Doctor: I am too busy for this.')
    expect(prompt).toContain('Rep: I understand — what specifically is eating your time?')
    expect(prompt).toContain('wrong_info')
    expect(prompt).toContain('"clarify"')
    expect(prompt).toContain('"objectionType"')
  })
  it('marks an empty transcript explicitly rather than rendering blank', () => {
    expect(buildLiveJudgePrompt(doctor, 'driver', 'en', [])).toContain('(no conversation recorded)')
  })
})

describe('parseLiveJudgeResponse', () => {
  it('parses a well-formed response', () => {
    const text = '{"objectionType":"doubt","outcome":"won","clearSteps":["listen","answer"]}'
    expect(parseLiveJudgeResponse(text)).toEqual({ objectionType: 'doubt', outcome: 'won', clearSteps: ['listen', 'answer'] })
  })
  it('filters invalid clearSteps entries rather than rejecting the whole response', () => {
    const text = '{"objectionType":"doubt","outcome":"won","clearSteps":["listen","bogus"]}'
    expect(parseLiveJudgeResponse(text)).toEqual({ objectionType: 'doubt', outcome: 'won', clearSteps: ['listen'] })
  })
  it('rejects an invalid objectionType or outcome', () => {
    expect(parseLiveJudgeResponse('{"objectionType":"bogus","outcome":"won","clearSteps":[]}')).toBeNull()
    expect(parseLiveJudgeResponse('{"objectionType":"doubt","outcome":"maybe","clearSteps":[]}')).toBeNull()
  })
  it('rejects malformed JSON', () => {
    expect(parseLiveJudgeResponse('not json')).toBeNull()
  })
})

describe('transcriptToConversationTurns', () => {
  it('maps each transcript entry to an indexed row with the shared objectionType', () => {
    const transcript: LiveTranscriptTurn[] = [
      { role: 'doctor', text: 'Too busy.' },
      { role: 'rep', text: 'Understood.' },
    ]
    const rows = transcriptToConversationTurns(transcript, { sessionId: 's1', repId: 'r1', doctorId: 'd1', objectionType: 'indifference' })
    expect(rows).toEqual([
      { session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0, role: 'doctor', text: 'Too busy.', objection_type: 'indifference', clear_steps_hit: [] },
      { session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 1, role: 'rep', text: 'Understood.', objection_type: 'indifference', clear_steps_hit: [] },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/voice-live-core.test.ts`
Expected: FAIL — `voice-live-core.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/voice-live-core.ts
import type { Doctor, StyleKey } from '@/types/game'
import { type ObjectionType, isObjectionType, type ClearStep, isClearStep, personaLines } from '@/lib/voice-partner-core'

export type LiveTranscriptTurn = { role: 'rep' | 'doctor'; text: string }

/** No rep turn exists yet — nothing to score. Mirrors the empty/near-empty
 * transcript skip rule from the design spec: never spend a judge call, or
 * save a session, on a call the rep never actually spoke in. */
export function shouldSkipJudge(transcript: LiveTranscriptTurn[]): boolean {
  return transcript.filter(t => t.role === 'rep').length === 0
}

/** One-shot judge prompt over a FULL completed conversation, unlike
 * `buildJudgePrompt` (per-turn, mid-conversation, doctor already knows the
 * objection type going in). Here the objection type itself is also unknown
 * up front — the live bot picks a free-text objection from the doctor's
 * `objections`/`objection_notes`, not a structured ObjectionType — so the
 * judge classifies it post-hoc from the transcript, alongside scoring. */
export function buildLiveJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', transcript: LiveTranscriptTurn[]): string {
  const conversation = transcript.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `${personaLines(doctor, style, lang)}

You just finished a live spoken practice conversation with a sales rep. Review the full transcript below as an objective observer — you are not the doctor now, you are scoring the rep's performance.

Full conversation:
${conversation || '(no conversation recorded)'}

Classify the objection the doctor raised into exactly one of these five types:
- "wrong_info": the doctor's concern was based on a factual misunderstanding
- "doubt": the doctor doesn't believe the claim without more evidence
- "true_objection": the doctor has a real, valid concern about the product/fit
- "indifference": the doctor doesn't see why this matters to their practice
- "false_objection": the doctor's stated reason isn't their real reason

Decide the outcome: "won" if the rep resolved the doctor's concern by the end of the conversation, "escalated" if the doctor remained unconvinced or disengaged.

Identify every CLEAR objection-handling step the rep demonstrated at any point in the conversation:
- "clarify": asked an open-ended question to understand the concern better
- "listen": paraphrased, reflected back, or repeated what the doctor said
- "empathy": acknowledged how the doctor feels or thinks about this
- "answer": gave a substantive response addressing the objection
- "recheck": asked whether their answer resolved the concern or if anything remains

Return JSON exactly in this shape:
{
  "objectionType": "wrong_info" | "doubt" | "true_objection" | "indifference" | "false_objection",
  "outcome": "won" | "escalated",
  "clearSteps": ["clarify", "listen", "empathy", "answer", "recheck"]
}
"clearSteps" = the subset of the five steps the rep demonstrated anywhere in the conversation — empty array if none.`
}

export function parseLiveJudgeResponse(text: string): { objectionType: ObjectionType; outcome: 'won' | 'escalated'; clearSteps: ClearStep[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || !isObjectionType(o.objectionType)) return null
  if (o.outcome !== 'won' && o.outcome !== 'escalated') return null
  const clearSteps: ClearStep[] = Array.isArray(o.clearSteps) ? o.clearSteps.filter(isClearStep) : []
  return { objectionType: o.objectionType, outcome: o.outcome, clearSteps }
}

export type ConversationTurnRow = {
  session_id: string; rep_id: string; doctor_id: string; turn_index: number
  role: 'rep' | 'doctor'; text: string; objection_type: ObjectionType; clear_steps_hit: ClearStep[]
}

/** Backfills `conversation_turns` from a realtime transcript so Phase 2-6
 * deep analysis keeps working on this mode too. `clear_steps_hit` is left
 * empty on every row — the judge here scores the whole conversation, not
 * each turn, so per-turn step attribution would be fabricated, not derived.
 * `trust`/`skepticism`/`engagement`/`time_pressure` are intentionally
 * omitted (column is nullable): this mode has no physician-state model, so
 * Pressure Shift naturally finds no pressure moment for these sessions
 * rather than a faked one. */
export function transcriptToConversationTurns(
  transcript: LiveTranscriptTurn[],
  ctx: { sessionId: string; repId: string; doctorId: string; objectionType: ObjectionType },
): ConversationTurnRow[] {
  return transcript.map((turn, index) => ({
    session_id: ctx.sessionId, rep_id: ctx.repId, doctor_id: ctx.doctorId, turn_index: index,
    role: turn.role, text: turn.text, objection_type: ctx.objectionType, clear_steps_hit: [],
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/voice-live-core.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-live-core.ts src/lib/voice-live-core.test.ts
git commit -m "feat: pure scoring core for realtime voice partner"
```

---

## Task 3: `/api/voice-partner/live-judge` route

**Files:**
- Create: `src/app/api/voice-partner/live-judge/route.ts`
- Test: `src/app/api/voice-partner/live-judge/route.test.ts`

**Interfaces:**
- Consumes: `shouldSkipJudge`, `buildLiveJudgePrompt`, `parseLiveJudgeResponse`, `transcriptToConversationTurns`, `LiveTranscriptTurn` from Task 2's `voice-live-core.ts`; `checkRateLimit` from `@/lib/rate-limit`; `createClient` from `@/lib/supabase-server`; `Doctor` from `@/types/game`.
- Produces: `POST` returning `{ objectionType, outcome, clearSteps, turnCount }` on success (200), or `{ ok: true, scored: false, turnCount }` (200) when the judge call itself fails but the transcript had content — client (Task 5/6) branches on the presence of `objectionType` to decide whether to call `session-result`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/voice-partner/live-judge/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function mockSupabase(doctor: unknown, userId = 'rep-1') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: doctor }) }) }),
      insert: async () => ({ error: null }),
    }),
  }
}

const request = (body: unknown) => new Request('http://localhost/api/voice-partner/live-judge', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

const doctor = { id: 'd1', style: 'driver' }

describe('POST /api/voice-partner/live-judge', () => {
  it('rejects when not configured', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'false')
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [] }))
    expect(res.status).toBe(503)
  })
  it('rejects unauthenticated requests', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [] }))
    expect(res.status).toBe(401)
  })
  it('rejects an empty (no rep turns) transcript without calling the judge', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [{ role: 'doctor', text: 'Hi' }] }))
    expect(res.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns scored=false when the judge call fails, without erroring the request', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [{ role: 'rep', text: 'Hello doctor' }] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ ok: true, scored: false, turnCount: 1 })
  })
  it('returns the judged result on success', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const anthropicBody = { content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":["listen"]}' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(anthropicBody)))
    const res = await POST(request({
      doctorId: 'd1', difficulty: 'realistic',
      transcript: [{ role: 'doctor', text: 'Too busy.' }, { role: 'rep', text: 'What is eating your time?' }],
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ objectionType: 'doubt', outcome: 'won', clearSteps: ['listen'], turnCount: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/voice-partner/live-judge/route.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/voice-partner/live-judge/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { SYSTEM, isDifficulty } from '@/lib/voice-partner-core'
import { shouldSkipJudge, buildLiveJudgePrompt, parseLiveJudgeResponse, transcriptToConversationTurns, type LiveTranscriptTurn } from '@/lib/voice-live-core'
import type { Doctor } from '@/types/game'

const MAX_TRANSCRIPT_ENTRIES = 200
const MAX_TURN_CHARS = 2000

function parseTranscript(raw: unknown): LiveTranscriptTurn[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_TRANSCRIPT_ENTRIES) return null
  const turns: LiveTranscriptTurn[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const { role, text } = entry as Record<string, unknown>
    if (role !== 'doctor' && role !== 'rep') return null
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TURN_CHARS) return null
    turns.push({ role, text })
  }
  return turns
}

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_LIVE_ENABLED !== 'true' || !anthropicKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with the rest of voice-partner traffic (see open/route.ts).
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { doctorId?: string; difficulty?: string; sessionId?: string; transcript?: unknown } | null
  if (!body || typeof body.doctorId !== 'string' || !body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.difficulty !== undefined && !isDifficulty(body.difficulty)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const transcript = parseTranscript(body.transcript)
  if (!transcript) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (shouldSkipJudge(transcript)) return NextResponse.json({ error: 'empty_transcript' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const turnCount = transcript.filter(t => t.role === 'rep').length
  const prompt = buildLiveJudgePrompt(doctor as Doctor, style, 'en', transcript)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
    })
  } catch { res = new Response('', { status: 502 }) }

  const judged = res.ok
    ? parseLiveJudgeResponse((await res.json().catch(() => null) as { content?: { text?: string }[] } | null)?.content?.[0]?.text ?? '')
    : null

  // Judge failed (upstream error or malformed output): don't drop a
  // completed call — insert a minimal, unscored session record directly
  // (session-result's contract requires objectionType/outcome/clearSteps,
  // which we don't have here) and tell the client not to expect a score.
  if (!judged) {
    const { error } = await supabase.from('voice_partner_sessions').insert({
      rep_id: user.id, doctor_id: body.doctorId, style, turn_count: turnCount,
      ...(body.sessionId ? { id: body.sessionId } : {}), ...(body.difficulty ? { difficulty: body.difficulty } : {}),
    })
    if (error) console.warn('voice_partner_sessions fallback insert failed:', error.message)
    return NextResponse.json({ ok: true, scored: false, turnCount })
  }

  // Best-effort evidence store, same rationale as turn/route.ts's insert —
  // never blocks the response on it.
  const sessionId = body.sessionId ?? crypto.randomUUID()
  const { error: turnInsertError } = await supabase.from('conversation_turns').insert(
    transcriptToConversationTurns(transcript, { sessionId, repId: user.id, doctorId: body.doctorId, objectionType: judged.objectionType }),
  )
  if (turnInsertError) console.warn('conversation_turns insert failed (live-judge):', turnInsertError.message)

  return NextResponse.json({ ...judged, turnCount })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/voice-partner/live-judge/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice-partner/live-judge/route.ts src/app/api/voice-partner/live-judge/route.test.ts
git commit -m "feat: post-call transcript scoring route for realtime voice partner"
```

---

## Task 4: Gate `/api/pipecat/session` behind the new flag

**Files:**
- Modify: `src/app/api/pipecat/session/route.ts:7-9`
- Modify: `src/app/api/pipecat/session/route.test.ts` (add one test)

**Interfaces:**
- Produces: the route now also returns 503 `pipecat_not_configured` when `AI_VOICE_PARTNER_LIVE_ENABLED !== 'true'`, matching the existing `res.status === 503` → `notconfigured` phase convention every other voice-partner hook already uses (see `useVoicePartner.ts:47,143`).

- [ ] **Step 1: Add the flag check**

In `src/app/api/pipecat/session/route.ts`, change:
```typescript
export async function POST(req: Request) {
  const publicKey = process.env.PIPECAT_CLOUD_PUBLIC_KEY
  if (!publicKey) return NextResponse.json({ error: 'pipecat_not_configured' }, { status: 503 })
```
to:
```typescript
export async function POST(req: Request) {
  const publicKey = process.env.PIPECAT_CLOUD_PUBLIC_KEY
  if (process.env.AI_VOICE_PARTNER_LIVE_ENABLED !== 'true' || !publicKey) {
    return NextResponse.json({ error: 'pipecat_not_configured' }, { status: 503 })
  }
```

- [ ] **Step 2: Add a test for the new gate**

Open `src/app/api/pipecat/session/route.test.ts`, find the existing "not configured" test for a missing `publicKey`, and add a sibling test right after it:
```typescript
it('rejects when AI_VOICE_PARTNER_LIVE_ENABLED is not true even with a public key set', async () => {
  vi.stubEnv('PIPECAT_CLOUD_PUBLIC_KEY', 'pk_test')
  vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'false')
  const res = await POST(request({ doctorId: 'd1' }))
  expect(res.status).toBe(503)
})
```
(Match the existing file's mock/import/`request()` helper conventions exactly — read the file first and place this next to the existing missing-`publicKey` test, reusing whatever `vi.stubEnv`/mock setup that test already uses.)

- [ ] **Step 3: Run the test file**

Run: `npx vitest run src/app/api/pipecat/session/route.test.ts`
Expected: PASS, including the new test.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pipecat/session/route.ts src/app/api/pipecat/session/route.test.ts
git commit -m "feat: gate pipecat session start behind AI_VOICE_PARTNER_LIVE_ENABLED"
```

---

## Task 5: Install client SDK + `useVoiceLive` hook

**Files:**
- Modify: `package.json` (add `@pipecat-ai/client-js`, `@pipecat-ai/daily-transport`)
- Create: `src/hooks/useVoiceLive.ts`
- Test: `src/hooks/useVoiceLive.test.ts`

**Interfaces:**
- Consumes: `Difficulty` from `@/lib/voice-partner-core`; `LiveTranscriptTurn` from `@/lib/voice-live-core`.
- Produces (used by Task 7): `useVoiceLive(doctorId, lang)` returning
  `{ state: 'idle' | 'connecting' | 'live' | 'ended' | 'error' | 'notconfigured', errorKind: 'mic' | 'network' | null, transcript: LiveTranscriptTurn[], connect: (difficulty: Difficulty) => Promise<void>, disconnect: () => Promise<void> }`.

- [ ] **Step 1: Install the dependencies**

Run: `npm install @pipecat-ai/client-js @pipecat-ai/daily-transport`
Expected: both added to `package.json` dependencies, `package-lock.json` updated.

- [ ] **Step 2: Inspect the installed package's actual API before writing code**

This package moves fast and this repo's own `AGENTS.md` already warns training data may be stale for adjacent tooling. Before writing `useVoiceLive.ts`:
- Read `node_modules/@pipecat-ai/client-js/dist/*.d.ts` (or the package's `README.md` if present) to confirm: the client class name (e.g. `PipecatClient`), its constructor options shape, the connect method's signature (does it take a `{ endpoint, requestData }` pair, or a pre-fetched `{ url, token }` room object — this determines exactly how the `/api/pipecat/session` response gets passed in), the transcription event name(s) for user vs. bot speech, and the mic-permission-denied error event/exception shape.
- Do the same for `node_modules/@pipecat-ai/daily-transport/dist/*.d.ts` for the transport constructor.
- Write down the exact names found — the implementation in Step 3 must use them verbatim, not a remembered/guessed API shape.

- [ ] **Step 3: Write the failing tests**

These test the state machine logic in isolation — mock the Pipecat client entirely, same approach this codebase already uses for `useAudioRecorder`/`useRoleplayRecorder` (state transitions tested independent of real mic/network access).

```typescript
// src/hooks/useVoiceLive.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

// The exact connect/on/disconnect method names below must match what
// Step 2's inspection found on the actually-installed client class —
// update this mock (and the hook) together if they differ.
const mockClientInstance = { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn() }
vi.mock('@pipecat-ai/client-js', () => ({ PipecatClient: vi.fn(() => mockClientInstance) }))
vi.mock('@pipecat-ai/daily-transport', () => ({ DailyTransport: vi.fn() }))

import { useVoiceLive } from './useVoiceLive'

describe('useVoiceLive', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    expect(result.current.state).toBe('idle')
    expect(result.current.transcript).toEqual([])
  })

  it('goes notconfigured on a 503 from /api/pipecat/session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('notconfigured'))
  })

  it('goes error on a non-503 session-start failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })))
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.errorKind).toBe('network')
  })

  it('reaches live once the room is fetched and the client connects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ room_url: 'https://x.daily.co/r', token: 't' })))
    mockClientInstance.connect.mockResolvedValue(undefined)
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('live'))
  })

  it('disconnect moves state to ended', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ room_url: 'https://x.daily.co/r', token: 't' })))
    mockClientInstance.connect.mockResolvedValue(undefined)
    mockClientInstance.disconnect.mockResolvedValue(undefined)
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('live'))
    await act(async () => { await result.current.disconnect() })
    expect(result.current.state).toBe('ended')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/hooks/useVoiceLive.test.ts`
Expected: FAIL — hook does not exist.

- [ ] **Step 5: Write the implementation**

Use the exact class/method/event names found in Step 2. The shape below is the state machine and control flow — adjust only the literal SDK calls to match what Step 2 found, not the structure:

```typescript
// src/hooks/useVoiceLive.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { PipecatClient } from '@pipecat-ai/client-js'
import { DailyTransport } from '@pipecat-ai/daily-transport'
import type { Difficulty } from '@/lib/voice-partner-core'
import type { LiveTranscriptTurn } from '@/lib/voice-live-core'

export type VoiceLiveState = 'idle' | 'connecting' | 'live' | 'ended' | 'error' | 'notconfigured'
export type VoiceLiveErrorKind = 'mic' | 'network' | null

export function useVoiceLive(doctorId: string, lang: 'en' | 'ar') {
  const [state, setState] = useState<VoiceLiveState>('idle')
  const [errorKind, setErrorKind] = useState<VoiceLiveErrorKind>(null)
  const [transcript, setTranscript] = useState<LiveTranscriptTurn[]>([])
  const clientRef = useRef<InstanceType<typeof PipecatClient> | null>(null)

  const connect = useCallback(async (difficulty: Difficulty) => {
    setState('connecting'); setErrorKind(null); setTranscript([])
    let res: Response
    try {
      res = await fetch('/api/pipecat/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang, difficulty }),
      })
    } catch { setState('error'); setErrorKind('network'); return }
    if (res.status === 503) { setState('notconfigured'); return }
    if (!res.ok) { setState('error'); setErrorKind('network'); return }
    const room = await res.json().catch(() => null) as { room_url?: string; token?: string } | null
    if (!room?.room_url || !room?.token) { setState('error'); setErrorKind('network'); return }

    const client = new PipecatClient({ transport: new DailyTransport() })
    clientRef.current = client
    client.on('userTranscript', (text: string) => setTranscript(t => [...t, { role: 'rep', text }]))
    client.on('botTranscript', (text: string) => setTranscript(t => [...t, { role: 'doctor', text }]))
    client.on('error', () => { setState('error'); setErrorKind('mic') })
    try {
      await client.connect({ url: room.room_url, token: room.token })
      setState('live')
    } catch { setState('error'); setErrorKind('mic') }
  }, [doctorId, lang])

  const disconnect = useCallback(async () => {
    if (clientRef.current) { await clientRef.current.disconnect().catch(() => {}) }
    setState('ended')
  }, [])

  return { state, errorKind, transcript, connect, disconnect }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/hooks/useVoiceLive.test.ts`
Expected: PASS. If Step 2's inspected API differs from the mock/hook above (e.g. different event names, or `connect` taking an `endpoint` string instead of `{url,token}`), update both the mock in the test and the hook body to match, then re-run.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/hooks/useVoiceLive.ts src/hooks/useVoiceLive.test.ts
git commit -m "feat: useVoiceLive hook for realtime Daily/Pipecat calls"
```

---

## Task 6: i18n — `voiceLive.*` keys

**Files:**
- Modify: `src/lib/i18n.tsx` (EN dict and AR dict)

**Interfaces:**
- Produces: `voiceLive.entryButton`, `voiceLive.premium`, `voiceLive.consentTitle`, `voiceLive.consentBody`, `voiceLive.consentCheckbox`, `voiceLive.consentAgree`, `voiceLive.consentCancel`, `voiceLive.difficultyTitle`, `voiceLive.connecting`, `voiceLive.live`, `voiceLive.endCall`, `voiceLive.errorMic`, `voiceLive.errorNetwork`, `voiceLive.notConfigured`, `voiceLive.teaser`, `voiceLive.back`, `voiceLive.scoring`, `voiceLive.unscoredNotice` — all consumed by Task 7's component.

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`, find the `const EN: Dict = {` block, locate the existing `voice.*` keys (search for `'voice.entryButton'`), and add a new block of keys right after the last `voice.*`/`voiceClosing.*` entry:

```typescript
  'voiceLive.entryButton': 'Live Voice Practice',
  'voiceLive.consentTitle': 'Live Voice Practice',
  'voiceLive.consentBody': "This is a real-time spoken call with an AI doctor — speak naturally, no recording/review step. Your microphone stays on for the whole call.",
  'voiceLive.consentCheckbox': 'I understand this call uses my live microphone.',
  'voiceLive.consentAgree': 'Start Call',
  'voiceLive.consentCancel': 'Cancel',
  'voiceLive.difficultyTitle': 'Difficulty',
  'voiceLive.connecting': 'Connecting…',
  'voiceLive.live': 'Live — speak now',
  'voiceLive.endCall': 'End Call',
  'voiceLive.errorMic': 'Microphone access is needed for a live call. Check your browser permissions and try again.',
  'voiceLive.errorNetwork': "Couldn't reach the live call service. Try again.",
  'voiceLive.premium': 'Premium',
  'voiceLive.teaser': 'Live voice practice with {{name}} is coming soon.',
  'voiceLive.notConfigured': "This feature isn't turned on yet — check back soon.",
  'voiceLive.back': 'Back',
  'voiceLive.scoring': 'Scoring your call…',
  'voiceLive.unscoredNotice': "We couldn't score this call, but your practice was logged.",
```

- [ ] **Step 2: Add the matching AR keys**

In the same file, find the `const AR: Dict = {` block, locate the same `voice.*` section, and add the mirrored Arabic block immediately after it:

```typescript
  'voiceLive.entryButton': 'ممارسة صوتية مباشرة',
  'voiceLive.consentTitle': 'ممارسة صوتية مباشرة',
  'voiceLive.consentBody': 'هذه مكالمة صوتية مباشرة مع طبيب افتراضي — تحدّث بشكل طبيعي، بلا تسجيل أو مراجعة. يبقى الميكروفون مفتوحاً طوال المكالمة.',
  'voiceLive.consentCheckbox': 'أفهم أن هذه المكالمة تستخدم ميكروفوني مباشرة.',
  'voiceLive.consentAgree': 'ابدأ المكالمة',
  'voiceLive.consentCancel': 'إلغاء',
  'voiceLive.difficultyTitle': 'مستوى الصعوبة',
  'voiceLive.connecting': 'جارٍ الاتصال…',
  'voiceLive.live': 'مباشر — تحدّث الآن',
  'voiceLive.endCall': 'إنهاء المكالمة',
  'voiceLive.errorMic': 'يلزم الوصول إلى الميكروفون لإجراء مكالمة مباشرة. تحقق من أذونات المتصفح وحاول مجدداً.',
  'voiceLive.errorNetwork': 'تعذّر الوصول إلى خدمة المكالمة المباشرة. حاول مجدداً.',
  'voiceLive.premium': 'مميز',
  'voiceLive.teaser': 'الممارسة الصوتية المباشرة مع {{name}} قريباً.',
  'voiceLive.notConfigured': 'هذه الميزة غير مفعّلة بعد — تحقق لاحقاً.',
  'voiceLive.back': 'رجوع',
  'voiceLive.scoring': 'جارٍ تقييم مكالمتك…',
  'voiceLive.unscoredNotice': 'تعذّر تقييم هذه المكالمة، لكن تم تسجيل تمرينك.',
```

- [ ] **Step 3: Visually verify the Arabic — do not skip this**

Use the Read tool (not `cat`/PowerShell, per this repo's known encoding gotcha) to read back the exact line range you just wrote in the AR block. Confirm every line shows real Arabic characters, not `?` placeholders. This is the exact failure mode caught on 2026-09-18 in `roleplay.*` keys — tests and typecheck do not catch it, only a visual re-read does.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (i18n changes are additive-only).

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: voiceLive i18n keys (EN+AR)"
```

---

## Task 7: `VoicePartnerLive.tsx` component

**Files:**
- Create: `src/components/game/VoicePartnerLive.tsx`

**Interfaces:**
- Consumes: `useVoiceLive` from Task 5; `DIFFICULTY_LEVELS`, `DEFAULT_DIFFICULTY`, `type Difficulty` from `@/lib/voice-partner-core`; `useT` from `@/lib/i18n`; `Doctor` from `@/types/game`; `voiceLive.*` keys from Task 6.
- Produces: `export default function VoicePartnerLive({ doctor, onDone }: { doctor: Doctor; onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void })` — same `onDone` contract as `VoicePartner.tsx` (`Props.onDone` at `VoicePartner.tsx:13`), so Task 8's wrapper can reuse the identical `addVisit` pattern.

- [ ] **Step 1: Write the component**

```tsx
// src/components/game/VoicePartnerLive.tsx
'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoiceLive } from '@/hooks/useVoiceLive'
import { DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY, type Difficulty } from '@/lib/voice-partner-core'
import { XP_VALUES } from '@/lib/game-data'
import { createClient } from '@/lib/supabase-browser'

interface Props {
  doctor: Doctor
  onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void
}

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
const difficultyChip = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--sans)', fontSize: 12.5, lineHeight: 1.4, borderRadius: 10, padding: '9px 12px',
  border: `1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, color: active ? 'var(--cyan)' : 'var(--ink-dim)',
  background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction: 'manipulation', width: '100%',
})

export default function VoicePartnerLive({ doctor, onDone }: Props) {
  const t = useT()
  const { state, errorKind, transcript, connect, disconnect } = useVoiceLive(doctor.id, 'en')
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY)
  const [scoring, setScoring] = useState(false)
  const [unscored, setUnscored] = useState(false)

  // Same inline pattern as useVoicePartner.ts's awardXpOnWin (not exported
  // there, and only that one of the 5 turn-based modes awards XP directly —
  // duplicated here rather than extracted, matching the codebase's existing
  // choice not to share it across modes).
  const awardXpOnWin = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile, error: profileError } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
    if (profileError || !profile) return
    const { error: xpError } = await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.voicePartnerWin }).eq('id', user.id)
    if (xpError) console.error('voice partner live xp update failed:', xpError.message)
  }

  const finishCall = async () => {
    await disconnect()
    setScoring(true)
    const turns = transcript.filter(entry => entry.role === 'rep').length
    if (turns === 0) { setScoring(false); onDone(false, { turns: 0, openingCrisis: '' }); return }
    try {
      const res = await fetch('/api/voice-partner/live-judge', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId: doctor.id, difficulty, transcript }),
      })
      const data = await res.json().catch(() => null) as { objectionType?: string; outcome?: 'won' | 'escalated'; clearSteps?: string[]; turnCount?: number; scored?: boolean } | null
      const openingCrisis = transcript.find(entry => entry.role === 'doctor')?.text ?? ''
      if (data?.scored === false) {
        setUnscored(true)
        onDone(false, { turns, openingCrisis })
        return
      }
      if (data?.objectionType && data.outcome && data.clearSteps && typeof data.turnCount === 'number') {
        await fetch('/api/voice-partner/session-result', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ doctorId: doctor.id, objectionType: data.objectionType, outcome: data.outcome, clearSteps: data.clearSteps, turnCount: data.turnCount, difficulty }),
        }).catch(() => {})
        if (data.outcome === 'won') await awardXpOnWin()
        onDone(data.outcome === 'won', { turns, openingCrisis })
        return
      }
      onDone(false, { turns, openingCrisis })
    } finally {
      setScoring(false)
    }
  }

  if (!consented) {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{t('voiceLive.consentTitle')}</div>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('voiceLive.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('voiceLive.consentCheckbox')}
          </label>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('voiceLive.difficultyTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DIFFICULTY_LEVELS.map(level => (
                <button key={level} onClick={() => setDifficulty(level)} style={difficultyChip(difficulty === level)}>
                  {t(`voice.difficulty.${level}`)}
                </button>
              ))}
            </div>
          </div>
          <button style={{ ...primaryBtn, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked} onClick={() => { setConsented(true); void connect(difficulty) }}>
            {t('voiceLive.consentAgree')}
          </button>
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone(false, { turns: 0, openingCrisis: '' })}>
            {t('voiceLive.consentCancel')}
          </button>
        </div>
      </div>
    )
  }

  if (state === 'notconfigured') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voiceLive.premium')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceLive.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voiceLive.notConfigured')}</div>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-dim)', fontSize: 14, marginBottom: 16 }}>{errorKind === 'mic' ? t('voiceLive.errorMic') : t('voiceLive.errorNetwork')}</p>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  if (scoring) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-dim)', fontSize: 14 }}>{t('voiceLive.scoring')}</div>
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 20 }}>
        {state === 'connecting' ? t('voiceLive.connecting') : t('voiceLive.live')}
      </div>
      {unscored && <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginBottom: 16 }}>{t('voiceLive.unscoredNotice')}</p>}
      {state === 'live' && (
        <button onClick={() => void finishCall()} style={{ ...primaryBtn, maxWidth: 280 }}>{t('voiceLive.endCall')}</button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/VoicePartnerLive.tsx
git commit -m "feat: VoicePartnerLive component (consent, live call, result handoff)"
```

---

## Task 8: Wire into `VisitPrep.tsx`

**Files:**
- Modify: `src/components/game/VisitPrep.tsx`

**Interfaces:**
- Consumes: `VoicePartnerLive` from Task 7; `useDoctorVisits` (existing hook, already imported in this file for the other 5 wrapper screens).

- [ ] **Step 1: Add the import**

Near the existing `import VoicePartner from './VoicePartner'` (line 17), add:
```typescript
import VoicePartnerLive from './VoicePartnerLive'
```

- [ ] **Step 2: Add the view-union case**

In the `View` type (lines 38-51), add a new line after `| { mode: 'voiceClosing'; doctor: Doctor }`:
```typescript
  | { mode: 'voiceLive'; doctor: Doctor }
```

- [ ] **Step 3: Add the wrapper component**

Right after the existing `VoicePartnerScreen` wrapper (the one at "AI voice partner wrapper (owns doctor_visits logging)", ending around line 700 where it returns `<VoicePartner .../>`), add a new wrapper following the exact same pattern:

```typescript
// ───────────────────────── AI voice partner (live call) wrapper (owns doctor_visits logging) ─────────────────────────
function VoicePartnerLiveScreen({ doctor, onDone }: { doctor: Doctor; onDone: () => void }) {
  const t = useT()
  const { addVisit } = useDoctorVisits(doctor.id)

  return (
    <VoicePartnerLive
      doctor={doctor}
      onDone={(won, meta) => {
        if (meta.turns > 0) {
          void addVisit({
            source: 'voice_partner_live',
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

- [ ] **Step 4: Add the mode dispatch**

Right after the existing:
```typescript
  if (view.mode === 'voiceClosing') {
    return <VoicePartnerClosingScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```
add:
```typescript

  // ───────────────────────── AI VOICE PARTNER: LIVE CALL ─────────────────────────
  if (view.mode === 'voiceLive') {
    return <VoicePartnerLiveScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 5: Add the entry button**

In the button block, right after the existing:
```tsx
            <button onClick={() => setView({ mode: 'voiceClosing', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('voiceClosing.entryButton')} · {t('voice.premium')}
            </button>
```
add:
```tsx
            <button onClick={() => setView({ mode: 'voiceLive', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              🎙 {t('voiceLive.entryButton')} · {t('voiceLive.premium')}
            </button>
```

- [ ] **Step 6: Add the doctor_visits source label**

Find the existing i18n label map for `visit.source*` (referenced around `src/components/game/VisitPrep.tsx:793`, the object with `manual: 'visit.sourceManual', ...`), and add:
```typescript
voice_partner_live: 'visit.sourceVoicePartnerLive',
```
Then in `src/lib/i18n.tsx`, add the matching key next to the existing `visit.sourceVoicePartnerClosing` entries in both EN and AR dicts:
```typescript
// EN
'visit.sourceVoicePartnerLive': 'Live voice practice',
// AR
'visit.sourceVoicePartnerLive': 'ممارسة صوتية مباشرة',
```
Re-read the AR line with the Read tool to confirm it's real Arabic, same as Task 6 Step 3.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (this task is UI wiring with no new pure-function logic).

- [ ] **Step 9: Commit**

```bash
git add src/components/game/VisitPrep.tsx src/lib/i18n.tsx
git commit -m "feat: wire live voice partner into VisitPrep as 6th practice mode"
```

---

## Task 9: Env docs + final verification

**Files:**
- Modify: `pipecat-agent/README.md` (or a new `docs/VOICE-PARTNER-LIVE-SETUP.md`, following the existing `docs/ORUK-SETUP.md` pattern for a short activation doc)

**Interfaces:** none — documentation and verification only.

- [ ] **Step 1: Write the activation doc**

Create `docs/VOICE-PARTNER-LIVE-SETUP.md`:
```markdown
# Live Voice Partner in StyleShift

The 6th VisitPrep practice mode: a real-time spoken call (Daily/Pipecat) against the AI doctor, scored the same way as the 5 turn-based modes.

## Activate

Set on Netlify (production context) and locally in `.env.local`:

​```
AI_VOICE_PARTNER_LIVE_ENABLED=true
​```

Already set in Netlify production as of 2026-09-18: `PIPECAT_AGENT_NAME`, `PIPECAT_CLOUD_PUBLIC_KEY`. Already set on the Pipecat Cloud agent's secret set (`styleshift-voice-partner-secrets`): `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `LIVE_PROVIDER`. `ANTHROPIC_API_KEY` (for the post-call judge) is already set in Netlify production from the existing turn-based Voice Partner activation.

Restart the local server or redeploy after setting the flag.

## Manual QA (cannot be automated — no mic access in headless browser)

1. Open a doctor's detail view in VisitPrep, tap "Live Voice Practice".
2. Accept consent, pick a difficulty, confirm the call connects (state moves connecting → live).
3. Speak a few lines, confirm the AI doctor responds in character with audio.
4. Tap "End Call" — confirm it reaches a scored result (win or escalate) and XP/visit history reflects it (check the doctor's Visit History panel for a new `voice_partner_live` entry).
5. Repeat once in Arabic (`lang: 'ar'`) if Arabic live-call support matters for this rollout — verify the bot speaks Arabic (Gemini/GPT-Live language capability in this mode is otherwise unverified).
6. Force a disconnect mid-call (e.g. kill network) — confirm no broken/half-saved state, the UI returns to the doctor detail view.
```

- [ ] **Step 2: Full verification pass**

Run in sequence:
```bash
npx tsc --noEmit
npx vitest run
npm run build
```
Expected: all three clean/green. This mirrors the standard verification this codebase already runs before every commit in this feature area (see `project_styleshift` memory's "Working pattern" note).

- [ ] **Step 3: Commit**

```bash
git add docs/VOICE-PARTNER-LIVE-SETUP.md
git commit -m "docs: activation + manual QA checklist for live voice partner"
```

---

## After this plan

Not done yet, by design (see spec's "Out of scope"): no in-UI provider (Gemini/OpenAI) picker, no Oruk vocal-delivery signal on this path, no in-call live transcript/scoring UI, no migration of the 5 existing turn-based modes to realtime. Manual QA (Task 9 checklist) is required before this ships to real reps — nothing in this plan validates actual live audio quality, since that's unreachable from automated tests.
