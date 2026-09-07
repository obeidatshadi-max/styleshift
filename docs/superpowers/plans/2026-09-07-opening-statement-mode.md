# Opening Statement Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second AI voice-partner mode — a single-shot "opening statement" drill — alongside the existing multi-turn objection/CLEAR mode.

**Architecture:** New standalone core module (`voice-partner-opening.ts`) holds the judge prompt + response parser for the single-shot rubric (4 criteria). A new one-call API route transcribes the rep's recorded statement and judges it in one round trip (no `/open` route — the rep speaks first, nothing to fetch before recording). A new hook and component mirror the existing `useVoicePartner`/`VoicePartner.tsx` shapes but drop the multi-turn transcript/turn-cap machinery. Results persist to a new table, and a new `VisitPrep.tsx` entry point wires it into the Digital Twin doctor-visit log, matching how the existing voice partner does it today.

**Tech Stack:** Next.js (App Router) API routes, React hooks/components, Supabase (Postgres + RLS), Anthropic Claude (judge), OpenAI Whisper (transcription), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-opening-statement-mode-design.md`

## Global Constraints

- No invented clinical data, statistics, dosages, or real/branded drug names anywhere in AI-facing prompts or judge output — reuse the existing `SYSTEM` guardrail constant, do not restate or diverge from it.
- Product is referred to only as "your product"; evidence only in generic terms ("the evidence pack", "the trial data").
- Same rate-limit bucket as the rest of voice partner: `checkRateLimit('voice-partner', user.id, 20, 3600)` on every new route.
- Same env gate as the rest of voice partner: `process.env.AI_VOICE_PARTNER_ENABLED !== 'true'` → `503 { error: 'not_configured' }` before any other check.
- Never trust client-supplied `style` — always look it up server-side from the `doctors` row.
- A failed session-result save must never block the rep from seeing their result screen (log + swallow, matching `saveSessionResult` in `useVoicePartner.ts`).
- No API-route or migration test files — this project's convention is `*-core.ts`/`*.test.ts` lib-level unit tests only.

---

### Task 1: Export shared helpers from `voice-partner-core.ts`

**Files:**
- Modify: `src/lib/voice-partner-core.ts:55-69` (export `langName` and `personaLines`), and the `transcribe` function currently inline in `src/app/api/voice-partner/turn/route.ts:30-48` (move it into `voice-partner-core.ts`, exported as `transcribeAudio`)
- Modify: `src/app/api/voice-partner/turn/route.ts` (import `transcribeAudio` instead of defining it locally)
- Test: `src/lib/voice-partner-core.test.ts` (existing file — must still pass unchanged; no new tests needed for this task, since `transcribeAudio` makes a real network call and this project's convention is not to unit-test that, and `langName`/`personaLines` are already covered indirectly through the existing prompt-builder tests)

**Interfaces:**
- Produces: `export function langName(lang: 'en' | 'ar'): string` (unchanged body, just exported)
- Produces: `export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string` (unchanged body, just exported)
- Produces: `export async function transcribeAudio(audio: Blob, apiKey: string, lang: 'en' | 'ar'): Promise<string | null>` (moved verbatim from `turn/route.ts`'s local `transcribe`, renamed)

- [ ] **Step 1: Export `langName` and `personaLines`**

In `src/lib/voice-partner-core.ts`, change:

```ts
function langName(lang: 'en' | 'ar'): string {
```

to:

```ts
export function langName(lang: 'en' | 'ar'): string {
```

and change:

```ts
function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
```

to:

```ts
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
```

Leave both function bodies untouched.

- [ ] **Step 2: Move `transcribe` into `voice-partner-core.ts` as `transcribeAudio`**

In `src/lib/voice-partner-core.ts`, add at the end of the file:

```ts
export async function transcribeAudio(audio: Blob, apiKey: string, lang: 'en' | 'ar'): Promise<string | null> {
  const form = new FormData()
  form.append('file', audio, 'turn.webm')
  form.append('model', 'whisper-1')
  // Pinning the language stops Whisper guessing (and mis-transcribing short
  // Arabic replies as another language) when the session is already known.
  form.append('language', lang === 'ar' ? 'ar' : 'en')
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
```

In `src/app/api/voice-partner/turn/route.ts`, delete the local `transcribe` function (lines 30-48) entirely, and change the import line:

```ts
import { SYSTEM, TURN_CAP, buildJudgePrompt, parseJudgeResponse, resolveTurn, isObjectionType, type VoicePartnerTurn } from '@/lib/voice-partner-core'
```

to:

```ts
import { SYSTEM, TURN_CAP, buildJudgePrompt, parseJudgeResponse, resolveTurn, isObjectionType, transcribeAudio, type VoicePartnerTurn } from '@/lib/voice-partner-core'
```

and change the one call site (currently `await transcribe(audio, openaiKey, lang)`) to `await transcribeAudio(audio, openaiKey, lang)`.

- [ ] **Step 3: Run the existing voice-partner-core test suite to confirm nothing broke**

Run: `npm test -- voice-partner-core`
Expected: PASS (all existing tests, unchanged)

- [ ] **Step 4: Commit**

```bash
git add src/lib/voice-partner-core.ts src/app/api/voice-partner/turn/route.ts
git commit -m "$(cat <<'EOF'
refactor: export voice-partner-core helpers for reuse by opening-statement mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 2: `voice-partner-opening.ts` core module (types, judge prompt, parser)

**Files:**
- Create: `src/lib/voice-partner-opening.ts`
- Test: `src/lib/voice-partner-opening.test.ts`

**Interfaces:**
- Consumes: `SYSTEM` (unused directly here, but the judge prompt is combined with it by the caller — see Task 6), `personaLines`, `langName` from `@/lib/voice-partner-core` (Task 1); `Doctor`, `StyleKey` from `@/types/game`
- Produces: `export type OpeningCriterion = 'problem_led' | 'relevant' | 'solution_linked' | 'concise'`
- Produces: `export const OPENING_CRITERIA: readonly OpeningCriterion[]`
- Produces: `export function isOpeningCriterion(value: unknown): value is OpeningCriterion`
- Produces: `export function buildOpeningJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string): string`
- Produces: `export function parseOpeningJudgeResponse(text: string): { doctorText: string; criteriaHit: OpeningCriterion[] } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice-partner-opening.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  OPENING_CRITERIA, isOpeningCriterion,
  buildOpeningJudgePrompt, parseOpeningJudgeResponse,
} from './voice-partner-opening'
import type { Doctor } from '@/types/game'

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

describe('isOpeningCriterion', () => {
  it('accepts each valid criterion', () => {
    for (const c of OPENING_CRITERIA) expect(isOpeningCriterion(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isOpeningCriterion('made_up')).toBe(false)
    expect(isOpeningCriterion(123)).toBe(false)
    expect(isOpeningCriterion(undefined)).toBe(false)
  })
})

describe('buildOpeningJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'Let me tell you about your product.')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'statement')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep statement text verbatim', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'Many of your elderly patients struggle with adherence.')
    expect(prompt).toContain('Many of your elderly patients struggle with adherence.')
  })

  it('describes all four criteria', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"problem_led"')
    expect(prompt).toContain('specific patient or clinical problem')
    expect(prompt).toContain('"relevant"')
    expect(prompt).toContain("this doctor's patient type")
    expect(prompt).toContain('"solution_linked"')
    expect(prompt).toContain('without inventing clinical data')
    expect(prompt).toContain('"concise"')
    expect(prompt).toContain('40 seconds')
  })

  it('asks for a JSON response with doctorText and criteriaHit', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"criteriaHit"')
  })
})

describe('parseOpeningJudgeResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseOpeningJudgeResponse('{"doctorText":"Go on.","criteriaHit":["problem_led","concise"]}')
    expect(parsed).toEqual({ doctorText: 'Go on.', criteriaHit: ['problem_led', 'concise'] })
  })

  it('strips surrounding commentary/markdown fences', () => {
    const parsed = parseOpeningJudgeResponse('```json\n{"doctorText":"Interesting.","criteriaHit":[]}\n```')
    expect(parsed).toEqual({ doctorText: 'Interesting.', criteriaHit: [] })
  })

  it('returns null for malformed JSON', () => {
    expect(parseOpeningJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"","criteriaHit":[]}')).toBeNull()
    expect(parseOpeningJudgeResponse('{}')).toBeNull()
  })

  it('defaults criteriaHit to an empty array when missing', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"Go on."}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('defaults criteriaHit to an empty array when not an array', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"Go on.","criteriaHit":"problem_led"}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('filters out unknown strings from criteriaHit', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"Go on.","criteriaHit":["problem_led","made_up","concise"]}')).toEqual({
      doctorText: 'Go on.', criteriaHit: ['problem_led', 'concise'],
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- voice-partner-opening`
Expected: FAIL — `voice-partner-opening.ts` does not exist yet ("Cannot find module './voice-partner-opening'")

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice-partner-opening.ts`:

```ts
import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type OpeningCriterion = 'problem_led' | 'relevant' | 'solution_linked' | 'concise'
export const OPENING_CRITERIA: readonly OpeningCriterion[] = ['problem_led', 'relevant', 'solution_linked', 'concise']

export function isOpeningCriterion(value: unknown): value is OpeningCriterion {
  return typeof value === 'string' && (OPENING_CRITERIA as readonly string[]).includes(value)
}

export function buildOpeningJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just delivered their opening statement to start the call:
"${statementText}"

Judge this opening statement against these criteria and give a short in-character reaction:
- "problem_led": did it open with a specific patient or clinical problem/challenge (not generic small talk, not a product pitch)?
- "relevant": is that problem one this doctor's patient type would plausibly face, given their specialty?
- "solution_linked": did it connect the problem to "your product" as the solution, without inventing clinical data (generic references like "the evidence pack" are fine, specific numbers or claims are not)?
- "concise": was it a short, focused statement (about 40 seconds spoken, not a long multi-point pitch)?

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken reaction, 1-2 sentences",
  "criteriaHit": ["problem_led", "relevant", "solution_linked", "concise"]
}
"criteriaHit" = the subset of the four criteria above this statement satisfied — empty array if none.`
}

export function parseOpeningJudgeResponse(text: string): { doctorText: string; criteriaHit: OpeningCriterion[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const criteriaHit: OpeningCriterion[] = Array.isArray(o.criteriaHit) ? o.criteriaHit.filter(isOpeningCriterion) : []
  return { doctorText: o.doctorText, criteriaHit }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- voice-partner-opening`
Expected: PASS (all tests in `voice-partner-opening.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-partner-opening.ts src/lib/voice-partner-opening.test.ts
git commit -m "$(cat <<'EOF'
feat: add opening-statement judge prompt and rubric to voice partner

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 3: Migration `015_voice_partner_opening_sessions.sql`

**Files:**
- Create: `supabase/migrations/015_voice_partner_opening_sessions.sql`

**Interfaces:**
- Produces: table `public.voice_partner_opening_sessions` (columns: `id`, `rep_id`, `doctor_id`, `style`, `criteria_hit text[]`, `created_at`), consumed by Task 7's API route.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/015_voice_partner_opening_sessions.sql`:

```sql
-- Voice-partner opening-statement results: one row per attempt (this mode
-- is single-turn, so unlike voice_partner_sessions there is no outcome or
-- turn_count — only which of the 4 rubric criteria the statement hit).
-- Rows are self-reported by the client (no server-side session state to
-- validate against) — a future manager-facing view must treat them as
-- practice self-reports, not audited results.
create table public.voice_partner_opening_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.voice_partner_opening_sessions enable row level security;

create policy "own voice partner opening sessions read" on public.voice_partner_opening_sessions for select using (rep_id = auth.uid());

create policy "own voice partner opening sessions insert" on public.voice_partner_opening_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner opening sessions read" on public.voice_partner_opening_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/015_voice_partner_opening_sessions.sql
git commit -m "$(cat <<'EOF'
feat: add voice_partner_opening_sessions table with RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

(No local apply/test step — this project's convention, per the objection/CLEAR migration before it, is that migrations aren't unit tested, only applied via the Supabase project's normal migration flow.)

---

### Task 4: i18n keys (EN + AR)

**Files:**
- Modify: `src/lib/i18n.tsx` (two places — the EN dictionary, currently ending its `voice.*` block around line 338, and the AR dictionary, currently ending its `voice.*` block around line 726)

**Interfaces:**
- Produces: translation keys consumed by Task 9 (`VoicePartnerOpening.tsx`) and Task 10 (`VisitPrep.tsx`).

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`, immediately after the line `'voice.consentCancel': 'Not Now',` (line 338), add:

```ts
  'voiceOpening.entryButton': '🗣️ Practice Opening Statement',
  'voiceOpening.teaser': "This premium feature lets you rehearse your opening statement out loud for {name} — the specific patient problem you lead with, before you ever pitch.",
  'voiceOpening.subtitle': 'Opening statement practice',
  'voiceOpening.done': 'Statement recorded',
  'voiceOpening.criterion.problem_led': 'Led with a specific patient problem',
  'voiceOpening.criterion.relevant': "Relevant to this doctor's patients",
  'voiceOpening.criterion.solution_linked': 'Connected the problem to your solution',
  'voiceOpening.criterion.concise': 'Concise — a focused statement, not a pitch',
  'visit.sourceVoicePartnerOpening': 'AI voice partner · opening statement',
  'visit.voicePartnerOpeningNote': 'AI voice partner · opening statement · {hit}/{total} criteria met',
```

- [ ] **Step 2: Add the AR keys**

In `src/lib/i18n.tsx`, immediately after the line `'voice.consentCancel': 'ليس الآن',` (line 726), add:

```ts
  'voiceOpening.entryButton': '🗣️ تدرّب على جملة الافتتاح',
  'voiceOpening.teaser': 'تتيح لك هذه الميزة المميّزة التدرّب بصوت مسموع على جملة افتتاح المكالمة أمام {name} — مشكلة المريض المحددة التي تبدأ بها، قبل أي عرض تسويقي.',
  'voiceOpening.subtitle': 'تدريب جملة الافتتاح',
  'voiceOpening.done': 'تم تسجيل الجملة',
  'voiceOpening.criterion.problem_led': 'بدأت بمشكلة محددة للمريض',
  'voiceOpening.criterion.relevant': 'ذات صلة بمرضى هذا الطبيب',
  'voiceOpening.criterion.solution_linked': 'ربطت المشكلة بحل منتجك',
  'voiceOpening.criterion.concise': 'موجزة — جملة مركّزة وليست عرضاً تسويقياً',
  'visit.sourceVoicePartnerOpening': 'شريك صوتي بالذكاء · جملة الافتتاح',
  'visit.voicePartnerOpeningNote': 'شريك صوتي بالذكاء · جملة الافتتاح · {hit}/{total} معايير محققة',
```

- [ ] **Step 3: Verify both dictionaries define the same key set**

Run: `node -e "const {EN,AR}=require('./src/lib/i18n.tsx'); " 2>/dev/null; grep -oE "^\s*'voiceOpening\.[a-zA-Z_.]+'|^\s*'visit\.(sourceVoicePartnerOpening|voicePartnerOpeningNote)'" src/lib/i18n.tsx | sort | uniq -c`

Expected: every key listed exactly twice (once per language block). If a `require` fails because the file is TSX (expected — the inline `node -e` probe is disposable, only the `grep` count matters), ignore that error and rely on the `grep` output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "$(cat <<'EOF'
feat: add EN+AR translations for opening statement mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 5: API route `POST /api/voice-partner/opening-statement`

**Files:**
- Create: `src/app/api/voice-partner/opening-statement/route.ts`

**Interfaces:**
- Consumes: `SYSTEM`, `transcribeAudio` from `@/lib/voice-partner-core` (Task 1); `buildOpeningJudgePrompt`, `parseOpeningJudgeResponse` from `@/lib/voice-partner-opening` (Task 2); `buildHistoryContext` from `@/lib/doctor-context`; `checkRateLimit` from `@/lib/rate-limit`; `createClient` from `@/lib/supabase-server`
- Produces: `POST` handler returning `{ repText, doctorText, criteriaHit }` on success, consumed by Task 8's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/opening-statement/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, transcribeAudio } from '@/lib/voice-partner-core'
import { buildOpeningJudgePrompt, parseOpeningJudgeResponse } from '@/lib/voice-partner-opening'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Doctor, DoctorVisit } from '@/types/game'

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !openaiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with objection mode's open/turn/speak (see open/route.ts).
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const doctorId = form.get('doctorId')
  const lang = form.get('lang') === 'ar' ? 'ar' : 'en'
  const audio = form.get('audio')
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  const repText = await transcribeAudio(audio, openaiKey, lang)
  if (!repText) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const prompt = buildOpeningJudgePrompt(doctor as Doctor, style, lang, historyContext, repText)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const judged = parseOpeningJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ repText, doctorText: judged.doctorText, criteriaHit: judged.criteriaHit })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/opening-statement/route.ts
git commit -m "$(cat <<'EOF'
feat: add opening-statement voice partner judge route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 6: API route `POST /api/voice-partner/opening-session-result`

**Files:**
- Create: `src/app/api/voice-partner/opening-session-result/route.ts`

**Interfaces:**
- Consumes: `isOpeningCriterion`, `type OpeningCriterion` from `@/lib/voice-partner-opening` (Task 2); the `voice_partner_opening_sessions` table (Task 3)
- Produces: `POST` handler inserting one session-result row, consumed by Task 8's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/opening-session-result/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isOpeningCriterion, type OpeningCriterion } from '@/lib/voice-partner-opening'
import type { Doctor } from '@/types/game'

// Stricter than the AI-judge-output parsing in voice-partner-opening.ts:
// this route rejects the whole request if ANY element is invalid, rather
// than silently filtering out the bad ones.
function parseCriteriaHit(raw: unknown): OpeningCriterion[] | null {
  if (!Array.isArray(raw)) return null
  return raw.every(isOpeningCriterion) ? (raw as OpeningCriterion[]) : null
}

export async function POST(req: Request) {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with the rest of voice partner — this route makes no
  // upstream AI call, but one insert per attempt is a negligible addition
  // to that budget and keeps all voice-partner traffic under one limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { doctorId?: string; criteriaHit?: unknown } | null
  if (!body?.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const criteriaHit = parseCriteriaHit(body.criteriaHit)
  if (!criteriaHit) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor; look style up
  // server-side rather than trusting a client-supplied value.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('voice_partner_opening_sessions').insert({
    rep_id: user.id,
    doctor_id: body.doctorId,
    style: (doctor as Doctor).style,
    criteria_hit: criteriaHit,
  })
  if (error) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/opening-session-result/route.ts
git commit -m "$(cat <<'EOF'
feat: add opening-statement session-result endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 7: `useVoicePartnerOpening` hook

**Files:**
- Create: `src/hooks/useVoicePartnerOpening.ts`

**Interfaces:**
- Consumes: `isOpeningCriterion`, `type OpeningCriterion` from `@/lib/voice-partner-opening` (Task 2); `POST /api/voice-partner/opening-statement` (Task 5), `POST /api/voice-partner/opening-session-result` (Task 6), `POST /api/voice-partner/speak` (existing, unchanged)
- Produces: `useVoicePartnerOpening(doctorId: string, lang: 'en' | 'ar')` returning `{ phase, result, startRecording, stopRecording, reset }` where `phase: 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error'` and `result: { doctorText: string; criteriaHit: OpeningCriterion[] } | null` — consumed by Task 9's component.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useVoicePartnerOpening.ts`:

```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { OpeningCriterion } from '@/lib/voice-partner-opening'
import { isOpeningCriterion } from '@/lib/voice-partner-opening'

export type VoicePartnerOpeningPhase =
  | 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error'

export type VoicePartnerOpeningResult = { doctorText: string; criteriaHit: OpeningCriterion[] }

async function speak(text: string, lang: 'en' | 'ar'): Promise<string | null> {
  const res = await fetch('/api/voice-partner/speak', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }),
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

export function useVoicePartnerOpening(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerOpeningPhase>('idle')
  const [result, setResult] = useState<VoicePartnerOpeningResult | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

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

  const saveSessionResult = useCallback(async (criteriaHit: OpeningCriterion[]) => {
    try {
      const res = await fetch('/api/voice-partner/opening-session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, criteriaHit }),
      })
      // Best-effort — the rep still sees their checklist either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('voice partner opening session-result save failed:', res.status)
    } catch (err) {
      console.warn('voice partner opening session-result save failed:', err)
    }
  }, [doctorId])

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
      form.append('audio', blob, 'opening.webm')

      const res = await fetch('/api/voice-partner/opening-statement', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; criteriaHit?: unknown } | null
      if (!data?.doctorText) { setPhase('error'); return }

      const criteriaHit = Array.isArray(data.criteriaHit) ? data.criteriaHit.filter(isOpeningCriterion) : []
      setResult({ doctorText: data.doctorText, criteriaHit })
      void saveSessionResult(criteriaHit)

      const audio = await speak(data.doctorText, lang)
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang, saveSessionResult])

  const reset = useCallback(() => {
    // Stop the recorder before its source tracks — some browsers only fire
    // onstop reliably when told directly, rather than inferring it from the
    // stream going away, which left a leaving-mid-recording tap with a live
    // mic (indicator stays lit until the tab reloads).
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop() } catch { /* already stopping */ }
    }
    mediaRecRef.current = null
    chunksRef.current = []
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setPhase('idle')
    setResult(null)
  }, [])

  return { phase, result, startRecording, stopRecording, reset }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useVoicePartnerOpening.ts
git commit -m "$(cat <<'EOF'
feat: add useVoicePartnerOpening hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 8: `VoicePartnerOpening.tsx` component

**Files:**
- Create: `src/components/game/VoicePartnerOpening.tsx`

**Interfaces:**
- Consumes: `useVoicePartnerOpening` (Task 7); `OPENING_CRITERIA` from `@/lib/voice-partner-opening` (Task 2); `Feedback` from `./helpers`; i18n keys `voiceOpening.*` and `voice.*` (Task 4 + existing)
- Produces: `export default function VoicePartnerOpening({ doctor, onDone }: { doctor: Doctor; onDone: (meta: { completed: boolean; criteriaHit: OpeningCriterion[] }) => void })`, consumed by Task 10's `VisitPrep.tsx` wrapper.

- [ ] **Step 1: Write the component**

Create `src/components/game/VoicePartnerOpening.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoicePartnerOpening } from '@/hooks/useVoicePartnerOpening'
import { OPENING_CRITERIA, type OpeningCriterion } from '@/lib/voice-partner-opening'
import { Feedback } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (meta: { completed: boolean; criteriaHit: OpeningCriterion[] }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function VoicePartnerOpening({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, result, startRecording, stopRecording, reset } = useVoicePartnerOpening(doctor.id, lang)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)

  const style = doctor.style
  const s = style ? STYLES[style] : null
  const c = style ? COLOR[style] : 'var(--ink-dim)'

  if (!consented) {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{t('voice.consentTitle')}</div>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('voice.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('voice.consentCheckbox')}
          </label>
          <button
            style={{ ...primaryBtn, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked}
            onClick={() => setConsented(true)}
          >
            {t('voice.consentAgree')}
          </button>
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone({ completed: false, criteriaHit: [] })}>
            {t('voice.consentCancel')}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'notconfigured') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voice.premium')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceOpening.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone({ completed: false, criteriaHit: [] })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  const checklistHtml = result
    ? `<div>${result.doctorText}</div>` +
      `<ul style="margin:8px 0 0;padding-inline-start:18px;list-style:none">` +
      OPENING_CRITERIA.map(crit => `<li>${result.criteriaHit.includes(crit) ? '✓' : '—'} ${t(`voiceOpening.criterion.${crit}`)}</li>`).join('') +
      `</ul>`
    : ''

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('voiceOpening.subtitle')}</div>
          </div>
        </div>

        {!result && (
          <>
            {/* Stays enabled in the 'error' phase on purpose: an upstream
                failure is retried by simply recording again. */}
            <button
              onClick={phase === 'recording' ? stopRecording : startRecording}
              disabled={phase === 'sending' || phase === 'playing'}
              style={{
                width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase',
                border: `1px solid ${phase === 'recording' ? 'var(--red)' : 'var(--cyan)'}`,
                color: phase === 'recording' ? 'var(--red)' : '#04121c',
                background: phase === 'recording' ? 'rgba(255,80,80,.08)' : 'var(--cyan)',
                borderRadius: 10, padding: '14px 18px', touchAction: 'manipulation',
                opacity: (phase === 'sending' || phase === 'playing') ? 0.6 : 1,
              }}
            >
              🎙️ {label}
            </button>
            {/* Always-available exit before a result exists. `reset()`
                releases any live mic stream/recorder first — tapping this
                mid-recording must not strand the microphone. Reports
                completed: false so the wrapper skips logging a phantom visit. */}
            <button
              onClick={() => { reset(); onDone({ completed: false, criteriaHit: [] }) }}
              style={{ ...ghostBtn, marginTop: 10 }}
            >
              {t('voice.back')}
            </button>
          </>
        )}

        {result && (
          <>
            <Feedback ok={true} title={t('voiceOpening.done')} body={checklistHtml} />
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => onDone({ completed: true, criteriaHit: result.criteriaHit })}
                style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }}
              >
                {t('result.logContinue')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/VoicePartnerOpening.tsx
git commit -m "$(cat <<'EOF'
feat: add VoicePartnerOpening component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 9: Wire into `VisitPrep.tsx` (view mode, entry button, doctor-visit logging)

**Files:**
- Modify: `src/types/game.ts:97` (extend `DoctorVisit['source']` union)
- Modify: `src/components/game/VisitPrep.tsx` (import component, add `View` variant, add render branch, add entry button, add wrapper, extend `SOURCE_LABEL_KEY`)

**Interfaces:**
- Consumes: `VoicePartnerOpening` (Task 8), `OPENING_CRITERIA` from `@/lib/voice-partner-opening` (Task 2), i18n keys from Task 4.
- Produces: entry point reachable from the doctor detail screen; a `voice_partner_opening` sourced row in `doctor_visits` on completion.

- [ ] **Step 1: Extend the `DoctorVisit` source union**

In `src/types/game.ts`, change line 97 from:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner'
```

to:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening'
```

- [ ] **Step 2: Import the new component and add the `View` variant**

In `src/components/game/VisitPrep.tsx`, add the import after line 15 (`import VoicePartner from './VoicePartner'`):

```tsx
import VoicePartnerOpening from './VoicePartnerOpening'
import { OPENING_CRITERIA } from '@/lib/voice-partner-opening'
```

Add a new variant to the `View` union (after line 30, `| { mode: 'voice'; doctor: Doctor }`):

```ts
  | { mode: 'voiceOpening'; doctor: Doctor }
```

- [ ] **Step 3: Add the render branch**

Immediately after the existing voice-partner render branch (after line 89, `}`, which closes the `if (view.mode === 'voice')` block), add:

```tsx
  // ───────────────────────── AI VOICE PARTNER: OPENING STATEMENT ─────────────────────────
  if (view.mode === 'voiceOpening') {
    return <VoicePartnerOpeningScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 4: Add the entry button**

In the cheat-panel button list, immediately after the existing voice-partner button (after line 152, the `</button>` closing `{t('voice.entryButton')} · {t('voice.premium')}`), add:

```tsx
            <button onClick={() => setView({ mode: 'voiceOpening', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('voiceOpening.entryButton')} · {t('voice.premium')}
            </button>
```

- [ ] **Step 5: Add the wrapper component**

Immediately after the existing `VoicePartnerScreen` wrapper function (after line 478, its closing `}`), add:

```tsx
// ───────────────────────── AI voice partner opening-statement wrapper (owns doctor_visits logging) ─────────────────────────
function VoicePartnerOpeningScreen({ doctor, onDone }: { doctor: Doctor; onDone: () => void }) {
  const t = useT()
  const { addVisit } = useDoctorVisits(doctor.id)

  return (
    <VoicePartnerOpening
      doctor={doctor}
      onDone={(meta) => {
        if (meta.completed) {
          void addVisit({
            source: 'voice_partner_opening',
            note: t('visit.voicePartnerOpeningNote', { hit: meta.criteriaHit.length, total: OPENING_CRITERIA.length }),
          })
        }
        onDone()
      }}
    />
  )
}
```

- [ ] **Step 6: Extend `SOURCE_LABEL_KEY`**

Change the `SOURCE_LABEL_KEY` map (currently at what was line 482, just after the wrapper) from:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner',
}
```

to:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening',
}
```

- [ ] **Step 7: Commit**

```bash
git add src/types/game.ts src/components/game/VisitPrep.tsx
git commit -m "$(cat <<'EOF'
feat: wire opening statement mode into VisitPrep doctor detail screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: PASS — every existing test plus the new `voice-partner-opening.test.ts` tests from Task 2.

- [ ] **Step 2: Run a full production build to type-check the whole app**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. This is this project's only type-checking gate (no separate `tsc --noEmit` script) — it is the step that would catch a mismatched import, a missing export, or a `View`/`SOURCE_LABEL_KEY` union that isn't exhaustive.

- [ ] **Step 3: If either step fails, fix and re-run before considering the plan complete**

No commit for this task — it's a gate, not a deliverable. If a fix is needed, make it in the file it belongs to and fold the fix into that file's most recent commit context (amend only if that commit hasn't been pushed and the user has approved amending; otherwise a small follow-up commit is fine).

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-09-07-opening-statement-mode-design.md` maps to a task — Data model → Tasks 2-3, API changes → Tasks 5-6, UI changes → Tasks 7-9, Error handling → inline in Tasks 5/6/7 (matching the spec's route-level error contract), Testing → Task 2's test file + Task 10's full-suite gate.
- **Placeholder scan:** no TBDs; every step has literal code, not a description of code.
- **Type consistency:** `OpeningCriterion`/`OPENING_CRITERIA`/`isOpeningCriterion` (Task 2) are the same identifiers used verbatim in Tasks 5, 6, 7, 8, 9 — no renaming across tasks. `{ completed: boolean; criteriaHit: OpeningCriterion[] }` is the one `onDone` meta shape used by both Task 8 (producer) and Task 9 (consumer).
