# Objection Taxonomy + CLEAR Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI voice partner four distinct objection types and score rep replies against the CLEAR handling model (Clarify/Listen/Empathy/Answer/Recheck), surfacing an end-of-session summary and persisting the result for future manager reporting.

**Architecture:** Extend the existing stateless voice-partner flow (`voice-partner-core.ts` + `open`/`turn` API routes) rather than rearchitect it. `open` picks a random objection type and returns it; the client resends it on every `turn` call (same trust model as the existing `history` field). The judge prompt now also tags which CLEAR steps a reply demonstrated; the client accumulates the union across turns and, on the terminal outcome, POSTs one summary row to a new `session-result` endpoint. Turns themselves remain unpersisted — only the final result is stored.

**Tech Stack:** Next.js API routes, TypeScript, Supabase (Postgres + RLS), Vitest, existing `i18n.tsx` flat-dictionary EN/AR system.

**Spec:** `docs/superpowers/specs/2026-09-07-objection-clear-model-design.md`

## Global Constraints

- Every user-facing string needs both an EN and an AR key in `src/lib/i18n.tsx` (flat dictionary, `'key': 'value'`, two parallel blocks ~353 lines apart).
- New DB objects must follow the exact RLS pattern already used by `roleplay_sessions` (migrations 009/010): own read/insert by `rep_id = auth.uid()`, insert also checks `doctor_id` (when present) belongs to the caller's own doctors, and a separate manager-read policy via `profiles.company_id` + `role = 'manager'`.
- All four voice-partner routes (`open`, `turn`, `speak`, and the new `session-result`) share one rate-limit bucket: `checkRateLimit('voice-partner', user.id, 20, 3600)`.
- No new npm dependencies.
- Manager dashboard UI is explicitly out of scope for this plan (see spec) — build only the table/RLS/API/rep-facing summary.
- This repo has no API route test files today — only `*-core.ts` lib-level Vitest files. Don't invent a route-testing convention; validate routes by type-checking (`npx tsc --noEmit`) and manual `npm run dev` verification.

---

### Task 1: Objection taxonomy + CLEAR step tagging in `voice-partner-core.ts`

**Files:**
- Modify: `src/lib/voice-partner-core.ts`
- Test: `src/lib/voice-partner-core.test.ts`

**Interfaces:**
- Produces: `ObjectionType` (`'wrong_info' | 'doubt' | 'true_objection' | 'indifference'`), `OBJECTION_TYPES: readonly ObjectionType[]`, `pickObjectionType(): ObjectionType`, `isObjectionType(value: unknown): value is ObjectionType`, `ClearStep` (`'clarify' | 'listen' | 'empathy' | 'answer' | 'recheck'`), `CLEAR_STEPS: readonly ClearStep[]`, `isClearStep(value: unknown): value is ClearStep`. Modifies `buildOpeningPrompt(doctor, style, lang, historyContext, objectionType: ObjectionType)`, `buildJudgePrompt(doctor, style, lang, historyContext, turns, repReply, turnCount, objectionType: ObjectionType)`, `parseJudgeResponse(text): { verdict, doctorReply, clearSteps: ClearStep[] } | null`.

- [ ] **Step 1: Replace the test file with the updated version (failing — signatures don't match yet)**

Replace the full contents of `src/lib/voice-partner-core.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  pickObjectionType, isObjectionType, OBJECTION_TYPES,
  type VoicePartnerTurn, type ObjectionType,
} from './voice-partner-core'
import type { Doctor } from '@/types/game'

/** A minimal Digital Twin doctor; `over` supplies the persona fields under test. */
function doctorFixture(over: Partial<Doctor> = {}): Doctor {
  return {
    id: 'd1', rep_id: 'r1', name: 'Dr. Amina',
    specialty: null, workplace: null, style: 'analytical',
    assertiveness: null, responsiveness: null,
    key_phrases: null, objections: [], objection_notes: null, notes: null,
    created_at: '', updated_at: '',
    ...over,
  }
}

const OBJECTION_KEYWORD: Record<ObjectionType, string> = {
  wrong_info: 'mistaken belief',
  doubt: 'skepticism about whether',
  true_objection: 'real, legitimate concern',
  indifference: 'low engagement',
}

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

describe('pickObjectionType', () => {
  it('always returns one of the four valid objection types', () => {
    for (let i = 0; i < 50; i++) {
      expect(OBJECTION_TYPES).toContain(pickObjectionType())
    }
  })
})

describe('isObjectionType', () => {
  it('accepts each valid objection type', () => {
    for (const type of OBJECTION_TYPES) expect(isObjectionType(type)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isObjectionType('made_up')).toBe(false)
    expect(isObjectionType(123)).toBe(false)
    expect(isObjectionType(undefined)).toBe(false)
  })
})

describe('buildOpeningPrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'doubt')
    expect(prompt).toContain('objection about price')
  })

  it('includes the specialty, key phrases, and objections when the doctor has them', () => {
    const prompt = buildOpeningPrompt(doctorFixture({
      specialty: 'Cardiology',
      key_phrases: 'Show me the data first',
      objections: ['price', 'formulary access'],
    }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Cardiology')
    expect(prompt).toContain('Show me the data first')
    expect(prompt).toContain('price, formulary access')
  })

  it('omits the persona lines entirely when key phrases and objections are empty', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).not.toContain('They often say things like')
    expect(prompt).not.toContain('Objection theme(s)')
  })

  it.each(OBJECTION_TYPES)('includes the type-specific instruction for %s', (type) => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', type)
    expect(prompt).toContain(OBJECTION_KEYWORD[type])
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
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'It pays for itself within a month.', 1, 'doubt')
    expect(prompt).toContain('Doctor: Your product costs too much.')
    expect(prompt).toContain('It pays for itself within a month.')
    expect(prompt).toContain(`rep reply #1 of a maximum ${TURN_CAP}`)
  })

  it('marks the opening turn explicitly when there is no prior transcript', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', [], 'first reply', 1, 'doubt')
    expect(prompt).toContain('the rep has not spoken yet')
  })

  it('includes the specialty, key phrases, and objections when the doctor has them', () => {
    const prompt = buildJudgePrompt(doctorFixture({
      specialty: 'Oncology',
      key_phrases: 'Get to the point',
      objections: ['switching cost'],
    }), 'driver', 'ar', '', turns, 'reply', 1, 'doubt')
    expect(prompt).toContain('Oncology')
    expect(prompt).toContain('Get to the point')
    expect(prompt).toContain('switching cost')
    expect(prompt).toContain('Arabic')
  })

  it.each(OBJECTION_TYPES)('includes the type-specific instruction for %s', (type) => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'reply', 1, type)
    expect(prompt).toContain(OBJECTION_KEYWORD[type])
  })

  it('asks the model to identify CLEAR steps demonstrated', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'reply', 1, 'doubt')
    expect(prompt).toContain('clearSteps')
    expect(prompt).toContain('"clarify"')
    expect(prompt).toContain('"recheck"')
  })
})

describe('parseJudgeResponse', () => {
  it('parses a valid verdict + reply with clearSteps', () => {
    const parsed = parseJudgeResponse('{"verdict":"continue","doctorReply":"Convince me further.","clearSteps":["listen","empathy"]}')
    expect(parsed).toEqual({ verdict: 'continue', doctorReply: 'Convince me further.', clearSteps: ['listen', 'empathy'] })
  })

  it('accepts win and escalate verdicts', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough.","clearSteps":[]}')?.verdict).toBe('win')
    expect(parseJudgeResponse('{"verdict":"escalate","doctorReply":"Not interested.","clearSteps":[]}')?.verdict).toBe('escalate')
  })

  it('returns null for an invalid verdict value', () => {
    expect(parseJudgeResponse('{"verdict":"maybe","doctorReply":"...","clearSteps":[]}')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorReply is missing or empty', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"","clearSteps":[]}')).toBeNull()
  })

  it('defaults clearSteps to an empty array when missing', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough."}')).toEqual({
      verdict: 'win', doctorReply: 'Fair enough.', clearSteps: [],
    })
  })

  it('defaults clearSteps to an empty array when not an array', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough.","clearSteps":"listen"}')).toEqual({
      verdict: 'win', doctorReply: 'Fair enough.', clearSteps: [],
    })
  })

  it('filters out unknown strings from clearSteps', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough.","clearSteps":["listen","made_up","empathy"]}')).toEqual({
      verdict: 'win', doctorReply: 'Fair enough.', clearSteps: ['listen', 'empathy'],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- voice-partner-core`
Expected: FAIL — TypeScript errors (`pickObjectionType`/`isObjectionType`/`OBJECTION_TYPES` not exported; `buildOpeningPrompt`/`buildJudgePrompt` called with too many arguments; `parseJudgeResponse` shape mismatch).

- [ ] **Step 3: Implement the taxonomy, CLEAR steps, and prompt changes**

In `src/lib/voice-partner-core.ts`, insert this block directly after the `SYSTEM` constant (before `function langName`):

```ts
export type ObjectionType = 'wrong_info' | 'doubt' | 'true_objection' | 'indifference'
export const OBJECTION_TYPES: readonly ObjectionType[] = ['wrong_info', 'doubt', 'true_objection', 'indifference']

export function pickObjectionType(): ObjectionType {
  return OBJECTION_TYPES[Math.floor(Math.random() * OBJECTION_TYPES.length)]
}

export function isObjectionType(value: unknown): value is ObjectionType {
  return typeof value === 'string' && (OBJECTION_TYPES as readonly string[]).includes(value)
}

export type ClearStep = 'clarify' | 'listen' | 'empathy' | 'answer' | 'recheck'
export const CLEAR_STEPS: readonly ClearStep[] = ['clarify', 'listen', 'empathy', 'answer', 'recheck']

export function isClearStep(value: unknown): value is ClearStep {
  return typeof value === 'string' && (CLEAR_STEPS as readonly string[]).includes(value)
}

/** What each objection type should feel like from the doctor's side, and how
 * the rep is meant to handle it — injected into both the opening and judge
 * prompts so the AI stays in character for the type across the whole session. */
const OBJECTION_INSTRUCTIONS: Record<ObjectionType, string> = {
  wrong_info: 'Your resistance is rooted in a mistaken belief you hold about "your product" — keep it a vague misconception (e.g. about how or for whom it is used), never a specific fabricated fact. The rep is meant to correct your misunderstanding diplomatically, pointing you to generic evidence ("the trial data", "the evidence pack") rather than inventing data of their own — reward that kind of correction.',
  doubt: 'Your resistance is skepticism about whether "your product" really works or is safe — you are not convinced, but you have not made up your mind against it either. The rep is meant to answer your doubt with third-party evidence (referred to generically, e.g. "the evidence pack" or "the trial data") — reward that more than a bare reassurance with no reference to evidence.',
  true_objection: 'Your resistance is a real, legitimate concern (for example, a side-effect or practical concern already reflected in your persona) — this is not a misunderstanding. The rep is meant to normalize and generalize it, acknowledging it is a known and manageable concern rather than dismissing or minimizing it — reward that, and stay resistant to a reply that brushes past your concern.',
  indifference: 'Show low engagement rather than a sharp objection — mild dismissiveness, a "not interested right now," or a shrug. You are hiding a real underlying concern that you will not volunteer. Only warm up if the rep asks genuine open-ended questions that draw out what is actually on your mind — a generic pitch or a closed yes/no question should not move you.',
}

function objectionInstruction(type: ObjectionType): string {
  return OBJECTION_INSTRUCTIONS[type]
}
```

Replace `buildOpeningPrompt` with:

```ts
export function buildOpeningPrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, objectionType: ObjectionType,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

${objectionInstruction(objectionType)}

Open the conversation with a short objection about "your product" — the opening resistance the rep needs to work through, in your own voice, 1-2 sentences.

Return JSON exactly in this shape:
{"doctorText": "your opening objection"}`
}
```

Replace `buildJudgePrompt` with:

```ts
export function buildJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string,
  turns: VoicePartnerTurn[], repReply: string, turnCount: number, objectionType: ObjectionType,
): string {
  const transcript = turns.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `${personaLines(doctor, style, lang)}
${historyContext}

${objectionInstruction(objectionType)}

Conversation so far:
${transcript || '(this is the opening line — the rep has not spoken yet)'}
Rep: ${repReply}

This is rep reply #${turnCount} of a maximum ${TURN_CAP}. Judge this reply and respond as the doctor.

Also identify which of the CLEAR objection-handling steps the rep's reply demonstrated, if any:
- "clarify": asked an open-ended question to understand your concern better
- "listen": paraphrased or reflected back what you said
- "empathy": acknowledged how you feel or think about this
- "answer": gave a substantive response addressing the objection (in the way appropriate to its type)
- "recheck": asked whether their answer resolved your concern or if anything remains

Return JSON exactly in this shape:
{
  "verdict": "win" | "escalate" | "continue",
  "doctorReply": "your in-character spoken reply, 1-3 sentences",
  "clearSteps": ["clarify", "listen", "empathy", "answer", "recheck"]
}
"win" = the rep's reply resolves your objection convincingly, end the conversation satisfied.
"escalate" = the rep's reply is weak or off-target and you're done listening, end the conversation unsatisfied.
"continue" = the reply is reasonable but you still have more resistance to raise — keep pushing.
"clearSteps" = the subset of the five steps above this specific reply demonstrated — empty array if none.`
}
```

Replace `parseJudgeResponse` with:

```ts
export function parseJudgeResponse(text: string): { verdict: VoicePartnerVerdict; doctorReply: string; clearSteps: ClearStep[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorReply !== 'string' || !o.doctorReply.trim()) return null
  if (o.verdict !== 'win' && o.verdict !== 'escalate' && o.verdict !== 'continue') return null
  const clearSteps: ClearStep[] = Array.isArray(o.clearSteps) ? o.clearSteps.filter(isClearStep) : []
  return { verdict: o.verdict, doctorReply: o.doctorReply, clearSteps }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- voice-partner-core`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-partner-core.ts src/lib/voice-partner-core.test.ts
git commit -m "feat: add objection taxonomy and CLEAR step tagging to voice partner core"
```

---

### Task 2: Wire objection type through the `open` and `turn` API routes

**Files:**
- Modify: `src/app/api/voice-partner/open/route.ts`
- Modify: `src/app/api/voice-partner/turn/route.ts`

**Interfaces:**
- Consumes: `pickObjectionType()`, `isObjectionType()`, `ObjectionType`, updated `buildOpeningPrompt`/`buildJudgePrompt`/`parseJudgeResponse` from Task 1.
- Produces: `open` now returns `{ doctorText: string, objectionType: ObjectionType }`. `turn` now requires a resent `objectionType` form field and returns `{ repText, doctorText, outcome, turnCount, clearSteps: ClearStep[] }`.

- [ ] **Step 1: Modify `open/route.ts`**

Change the import line:

```ts
import { SYSTEM, buildOpeningPrompt, parseOpeningResponse, pickObjectionType } from '@/lib/voice-partner-core'
```

After the line `const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])`, insert:

```ts
  const objectionType = pickObjectionType()
```

Change the `buildOpeningPrompt` call inside the `fetch` body to:

```ts
        messages: [{ role: 'user', content: buildOpeningPrompt(doctor as Doctor, style, lang, historyContext, objectionType) }],
```

Change the final return line to:

```ts
  return NextResponse.json({ doctorText, objectionType })
```

- [ ] **Step 2: Modify `turn/route.ts`**

Change the import line:

```ts
import { SYSTEM, TURN_CAP, buildJudgePrompt, parseJudgeResponse, resolveTurn, isObjectionType, type VoicePartnerTurn } from '@/lib/voice-partner-core'
```

After the existing block that reads `doctorId`, `lang`, `historyRaw`, `audio` from the form (the lines starting `const doctorId = form.get('doctorId')`), add a new line to read `objectionType` and validate it right after the existing `if (!(audio instanceof Blob))` check:

```ts
  const objectionTypeRaw = form.get('objectionType')
  if (typeof objectionTypeRaw !== 'string' || !isObjectionType(objectionTypeRaw)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
```

Change the `buildJudgePrompt` call to:

```ts
  const prompt = buildJudgePrompt(doctor as Doctor, style, lang, historyContext, history, repText, turnCount, objectionTypeRaw)
```

Change the final return line to:

```ts
  return NextResponse.json({ repText, doctorText: judged.doctorReply, outcome, turnCount, clearSteps: judged.clearSteps })
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `open/route.ts` or `turn/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/voice-partner/open/route.ts src/app/api/voice-partner/turn/route.ts
git commit -m "feat: pick and thread objection type through voice partner open/turn routes"
```

---

### Task 3: `voice_partner_sessions` migration

**Files:**
- Create: `supabase/migrations/014_voice_partner_sessions.sql`

**Interfaces:**
- Produces: table `public.voice_partner_sessions(id, rep_id, doctor_id, style, objection_type, outcome, clear_steps_hit, turn_count, created_at)` with RLS matching `roleplay_sessions`.

- [ ] **Step 1: Write the migration file**

```sql
-- Voice-partner objection-handling results: one row per completed AI voice
-- roleplay session (won or escalated — sessions that never resolve are never
-- persisted). Turns themselves stay stateless/unpersisted; only the final
-- objection type faced, CLEAR steps demonstrated, and verdict are stored.
create table public.voice_partner_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  objection_type text not null check (objection_type = any (
    array['wrong_info','doubt','true_objection','indifference']
  )),
  outcome text not null check (outcome = any (array['won','escalated'])),
  clear_steps_hit text[] not null default '{}',
  turn_count integer not null,
  created_at timestamptz not null default now()
);

alter table public.voice_partner_sessions enable row level security;

create policy "own voice partner sessions read" on public.voice_partner_sessions for select using (rep_id = auth.uid());

create policy "own voice partner sessions insert" on public.voice_partner_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner sessions read" on public.voice_partner_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
```

- [ ] **Step 2: Apply the migration locally / verify it parses**

Run: `supabase db push` (or the project's normal migration-apply command — check `README.md` if unsure which one is current). If no local Supabase instance is running, at minimum verify the SQL has no syntax errors by eyeballing it against `009_roleplay_sessions.sql`'s structure (already confirmed matching in the spec).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_voice_partner_sessions.sql
git commit -m "feat: add voice_partner_sessions table with RLS"
```

---

### Task 4: `session-result` API route

**Files:**
- Create: `src/app/api/voice-partner/session-result/route.ts`

**Interfaces:**
- Consumes: `isObjectionType`, `CLEAR_STEPS`, `type ClearStep` from `@/lib/voice-partner-core`; `voice_partner_sessions` table from Task 3.
- Produces: `POST /api/voice-partner/session-result` — body `{ doctorId: string, objectionType: ObjectionType, outcome: 'won' | 'escalated', clearSteps: ClearStep[], turnCount: number }` → `{ ok: true }` on success.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isObjectionType, CLEAR_STEPS, type ClearStep } from '@/lib/voice-partner-core'
import type { Doctor } from '@/types/game'

function parseClearSteps(raw: unknown): ClearStep[] | null {
  if (!Array.isArray(raw)) return null
  const steps: ClearStep[] = []
  for (const s of raw) {
    if (typeof s !== 'string' || !(CLEAR_STEPS as readonly string[]).includes(s)) return null
    steps.push(s as ClearStep)
  }
  return steps
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/speak (see open/route.ts) — this route makes
  // no upstream AI call, but one insert per session is a negligible addition
  // to that budget and keeps all voice-partner traffic under one limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as {
    doctorId?: string; objectionType?: string; outcome?: string; clearSteps?: unknown; turnCount?: number
  } | null
  if (!body?.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isObjectionType(body.objectionType)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.outcome !== 'won' && body.outcome !== 'escalated') return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof body.turnCount !== 'number' || !Number.isInteger(body.turnCount) || body.turnCount < 1)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const clearSteps = parseClearSteps(body.clearSteps)
  if (!clearSteps) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor; look style up
  // server-side rather than trusting a client-supplied value.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('voice_partner_sessions').insert({
    rep_id: user.id,
    doctor_id: body.doctorId,
    style: (doctor as Doctor).style,
    objection_type: body.objectionType,
    outcome: body.outcome,
    clear_steps_hit: clearSteps,
    turn_count: body.turnCount,
  })
  if (error) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `session-result/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice-partner/session-result/route.ts
git commit -m "feat: add voice partner session-result endpoint"
```

---

### Task 5: Track objection type + CLEAR steps in `useVoicePartner`

**Files:**
- Modify: `src/hooks/useVoicePartner.ts`

**Interfaces:**
- Consumes: `isObjectionType`, `isClearStep`, `type ObjectionType`, `type ClearStep` from `@/lib/voice-partner-core`; `POST /api/voice-partner/session-result` from Task 4.
- Produces: hook now also returns `objectionType: ObjectionType | null` and `clearStepsHit: ClearStep[]`.

- [ ] **Step 1: Update the import line**

```ts
import type { VoicePartnerTurn, TurnOutcome, ObjectionType, ClearStep } from '@/lib/voice-partner-core'
import { isObjectionType, isClearStep } from '@/lib/voice-partner-core'
```

- [ ] **Step 2: Add new state**

Inside `useVoicePartner`, alongside the existing `useState` calls, add:

```ts
  const [objectionType, setObjectionType] = useState<ObjectionType | null>(null)
  const [clearStepsHit, setClearStepsHit] = useState<ClearStep[]>([])
```

- [ ] **Step 3: Capture objection type in `startVoicePartner`**

Change the response-parsing block from:

```ts
      const data = await res.json().catch(() => null) as { doctorText?: string } | null
      if (!data?.doctorText) { setPhase('error'); return }
      setOpeningText(data.doctorText)
```

to:

```ts
      const data = await res.json().catch(() => null) as { doctorText?: string; objectionType?: string } | null
      if (!data?.doctorText || !isObjectionType(data.objectionType)) { setPhase('error'); return }
      setOpeningText(data.doctorText)
      setObjectionType(data.objectionType)
```

Also reset it at the top of `startVoicePartner` alongside the other resets:

```ts
    setPhase('opening')
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setObjectionType(null)
    setClearStepsHit([])
```

- [ ] **Step 4: Add a `saveSessionResult` helper**

Add this new `useCallback` right after `awardXpOnWin`:

```ts
  const saveSessionResult = useCallback(async (
    finalOutcome: 'won' | 'escalated', finalTurnCount: number, finalClearSteps: ClearStep[], type: ObjectionType,
  ) => {
    try {
      await fetch('/api/voice-partner/session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, objectionType: type, outcome: finalOutcome, clearSteps: finalClearSteps, turnCount: finalTurnCount }),
      })
    } catch {
      // Best-effort — the rep still sees their end-of-session summary either way.
    }
  }, [doctorId])
```

- [ ] **Step 5: Wire it into `stopRecording`**

At the top of `stopRecording`, right after `const rec = mediaRecRef.current; if (!rec) return`, add a guard (the objection type is always set by the time a turn can be sent, but this keeps the function honest about its precondition):

```ts
    if (!objectionType) { setPhase('error'); return }
```

In the `FormData` construction, add:

```ts
      form.append('objectionType', objectionType)
```

Change the response-parsing block from:

```ts
      const data = await res.json().catch(() => null) as {
        repText?: string; doctorText?: string; outcome?: TurnOutcome; turnCount?: number
      } | null
      if (!data?.repText || !data.doctorText || !data.outcome) { setPhase('error'); return }

      const nextTranscript: VoicePartnerTurn[] = [
        ...transcript, { role: 'rep', text: data.repText }, { role: 'doctor', text: data.doctorText },
      ]
      setTranscript(nextTranscript)
      setTurnCount(data.turnCount ?? turnCount + 1)
      // `outcome` means "the session has resolved" everywhere it's read — a
      // non-terminal 'continue' must leave it null so the mic stays available.
      if (data.outcome !== 'continue') setOutcome(data.outcome)
```

to:

```ts
      const data = await res.json().catch(() => null) as {
        repText?: string; doctorText?: string; outcome?: TurnOutcome; turnCount?: number; clearSteps?: unknown
      } | null
      if (!data?.repText || !data.doctorText || !data.outcome) { setPhase('error'); return }

      const nextTranscript: VoicePartnerTurn[] = [
        ...transcript, { role: 'rep', text: data.repText }, { role: 'doctor', text: data.doctorText },
      ]
      setTranscript(nextTranscript)
      const nextTurnCount = data.turnCount ?? turnCount + 1
      setTurnCount(nextTurnCount)

      const newSteps = Array.isArray(data.clearSteps) ? data.clearSteps.filter(isClearStep) : []
      const mergedSteps = Array.from(new Set([...clearStepsHit, ...newSteps]))
      setClearStepsHit(mergedSteps)

      // `outcome` means "the session has resolved" everywhere it's read — a
      // non-terminal 'continue' must leave it null so the mic stays available.
      if (data.outcome !== 'continue') {
        setOutcome(data.outcome)
        void saveSessionResult(data.outcome, nextTurnCount, mergedSteps, objectionType)
      }
```

Add `objectionType`, `clearStepsHit`, and `saveSessionResult` to `stopRecording`'s dependency array:

```ts
  }, [doctorId, lang, transcript, turnCount, awardXpOnWin, objectionType, clearStepsHit, saveSessionResult])
```

- [ ] **Step 6: Reset new state in `reset()`**

Add to the existing `reset` callback's body:

```ts
    setObjectionType(null)
    setClearStepsHit([])
```

- [ ] **Step 7: Return the new state**

Change the final return statement to:

```ts
  return {
    phase, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit,
    startVoicePartner, startRecording, stopRecording, reset,
  }
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `useVoicePartner.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useVoicePartner.ts
git commit -m "feat: track objection type and CLEAR steps in useVoicePartner, persist on session end"
```

---

### Task 6: i18n keys for objection types and CLEAR steps

**Files:**
- Modify: `src/lib/i18n.tsx`

**Interfaces:**
- Produces: new dictionary keys `voice.objType.wrong_info`, `voice.objType.doubt`, `voice.objType.true_objection`, `voice.objType.indifference`, `voice.objectionFaced`, `voice.clear.clarify`, `voice.clear.listen`, `voice.clear.empathy`, `voice.clear.answer`, `voice.clear.recheck` — in both the EN and AR dictionaries.

- [ ] **Step 1: Add EN keys**

In the EN dictionary block, immediately after the line `'voice.back': '← Back',`, insert:

```ts
  'voice.objType.wrong_info': 'Wrong info',
  'voice.objType.doubt': 'Doubt',
  'voice.objType.true_objection': 'True objection',
  'voice.objType.indifference': 'Indifference',
  'voice.objectionFaced': 'Objection type: {type}',
  'voice.clear.clarify': 'Clarify — asked an open question',
  'voice.clear.listen': 'Listen — paraphrased or reflected back',
  'voice.clear.empathy': 'Empathy — acknowledged how they feel',
  'voice.clear.answer': 'Answer — addressed the objection',
  'voice.clear.recheck': 'Recheck — confirmed it was resolved',
```

- [ ] **Step 2: Add AR keys**

In the AR dictionary block, immediately after the line `'voice.back': '← رجوع',`, insert:

```ts
  'voice.objType.wrong_info': 'معلومة خاطئة',
  'voice.objType.doubt': 'شك',
  'voice.objType.true_objection': 'اعتراض حقيقي',
  'voice.objType.indifference': 'عدم اكتراث',
  'voice.objectionFaced': 'نوع الاعتراض: {type}',
  'voice.clear.clarify': 'التوضيح — طرح سؤالاً مفتوحاً',
  'voice.clear.listen': 'الإصغاء — أعاد الصياغة أو كرر ما قيل',
  'voice.clear.empathy': 'التعاطف — أقرّ بمشاعر الطبيب',
  'voice.clear.answer': 'الإجابة — تناول الاعتراض',
  'voice.clear.recheck': 'إعادة التحقق — تأكد من حل الاعتراض',
```

- [ ] **Step 3: Verify the file still parses**

Run: `npx tsc --noEmit`
Expected: no errors referencing `i18n.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: add EN+AR translations for objection types and CLEAR steps"
```

---

### Task 7: Render the end-of-session CLEAR summary in `VoicePartner.tsx`

**Files:**
- Modify: `src/components/game/VoicePartner.tsx`

**Interfaces:**
- Consumes: `objectionType`, `clearStepsHit` from Task 5's `useVoicePartner`; `CLEAR_STEPS` from `@/lib/voice-partner-core`; existing `Feedback` component (`{ ok: boolean; title: string; body: string }`, `body` rendered via `dangerouslySetInnerHTML`).

- [ ] **Step 1: Update imports**

Change:

```ts
import { TURN_CAP } from '@/lib/voice-partner-core'
```

to:

```ts
import { TURN_CAP, CLEAR_STEPS } from '@/lib/voice-partner-core'
```

- [ ] **Step 2: Destructure the new hook fields**

Change:

```ts
  const { phase, transcript, turnCount, outcome, openingText, startVoicePartner, startRecording, stopRecording, reset } = useVoicePartner(doctor.id, lang)
```

to:

```ts
  const { phase, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit, startVoicePartner, startRecording, stopRecording, reset } = useVoicePartner(doctor.id, lang)
```

- [ ] **Step 3: Build the summary HTML and pass it to `Feedback`**

Immediately before the `return (` that starts the main render (i.e. right after the `label` computation), add:

```tsx
  const clearSummaryHtml = objectionType
    ? `<div>${t('voice.objectionFaced', { type: t(`voice.objType.${objectionType}`) })}</div>` +
      `<ul style="margin:8px 0 0;padding-left:18px;list-style:none">` +
      CLEAR_STEPS.map(step => `<li>${clearStepsHit.includes(step) ? '✓' : '—'} ${t(`voice.clear.${step}`)}</li>`).join('') +
      `</ul>`
    : ''
```

Change:

```tsx
            <Feedback ok={outcome === 'won'} title={outcome === 'won' ? t('voice.won') : t('voice.escalated')} body="" />
```

to:

```tsx
            <Feedback ok={outcome === 'won'} title={outcome === 'won' ? t('voice.won') : t('voice.escalated')} body={clearSummaryHtml} />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `VoicePartner.tsx`.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open a doctor's AI voice partner screen, play through a session to either `won` or `escalated`. Confirm the summary shows an objection-type line and a 5-row CLEAR checklist with ✓/— marks, in both EN and AR (toggle language).

- [ ] **Step 6: Full test suite + commit**

Run: `npm test`
Expected: PASS, all tests green (no regressions from earlier tasks).

```bash
git add src/components/game/VoicePartner.tsx
git commit -m "feat: render objection type and CLEAR checklist in voice partner summary"
```
