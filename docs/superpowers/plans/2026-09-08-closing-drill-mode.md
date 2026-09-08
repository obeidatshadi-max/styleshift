# Closing Drill Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth AI voice-partner mode — a single-turn "Closing & Commitment" drill — alongside the existing objection/CLEAR, opening-statement, question-drill, and FAB modes.

**Architecture:** New standalone core module (`voice-partner-closing.ts`) holds one judge prompt/parser, following the exact shape of `voice-partner-fab.ts` (single AI-judged take, 4-item checklist rubric, no turn loop, no verdict machine). One API route for the statement + judge call, one session-result route, a single-shot hook, a component, a DB table, EN/AR i18n, and wiring into the existing doctor-detail screen.

**Tech Stack:** Next.js (App Router) API routes, React hooks/components, Supabase (Postgres + RLS), Anthropic Claude (judge), OpenAI Whisper (transcription), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-closing-drill-mode-design.md`

## Global Constraints

- No invented clinical data, statistics, dosages, or real/branded drug names anywhere in AI-facing prompts or judge output — reuse the existing `SYSTEM` guardrail constant, do not restate or diverge from it.
- Product is referred to only as "your product"; evidence only in generic terms.
- Same rate-limit bucket as the rest of voice partner: `checkRateLimit('voice-partner', user.id, 20, 3600)` on every new route.
- Same env gate as the rest of voice partner: `process.env.AI_VOICE_PARTNER_ENABLED !== 'true'` (plus missing API keys on the judge route) → `503 { error: 'not_configured' }` before any other check.
- Never trust client-supplied `style` — always look it up server-side from the `doctors` row.
- A failed session-result save must never block the rep from seeing their result screen (log + swallow).
- `criteriaHit` parsing is lenient on the judge-response side (degrade to `[]` on missing/non-array/unknown-string elements) — `doctorText` is the only field that gates that parse. The session-result route's validation is the OPPOSITE — strict, reject-whole-array-on-any-invalid-element — because it validates client-submitted data, not AI judge output. Both routes exist in this plan; do not swap the leniency direction between them.
- Any component in this mode that builds an HTML string for `Feedback`'s `body` prop MUST escape every dynamic interpolation (AI-generated text, computed i18n lookups) using the shared `escapeHtml` helper from `src/components/game/helpers.tsx`.
- No API-route or migration test files — this project's convention is `*-core.ts`/`*.test.ts` lib-level unit tests only.
- Use the Edit tool for i18n.tsx insertions — do not regenerate the whole file via a shell command (this file has real Arabic text and a full-file re-save can silently corrupt the encoding in this environment).

---

### Task 1: `voice-partner-closing.ts` core module (types, judge prompt, parser)

**Files:**
- Create: `src/lib/voice-partner-closing.ts`
- Test: `src/lib/voice-partner-closing.test.ts`

**Interfaces:**
- Consumes: `personaLines` from `@/lib/voice-partner-core`; `Doctor`, `StyleKey` from `@/types/game`
- Produces: `export type ClosingCriterion = 'summarized_agreement' | 'asked_commitment' | 'ends_on_question' | 'concise'`
- Produces: `export const CLOSING_CRITERIA: readonly ClosingCriterion[]`
- Produces: `export function isClosingCriterion(value: unknown): value is ClosingCriterion`
- Produces: `export function buildClosingJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string): string`
- Produces: `export function parseClosingJudgeResponse(text: string): { doctorText: string; criteriaHit: ClosingCriterion[] } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice-partner-closing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  CLOSING_CRITERIA, isClosingCriterion,
  buildClosingJudgePrompt, parseClosingJudgeResponse,
} from './voice-partner-closing'
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

describe('isClosingCriterion', () => {
  it('accepts each valid criterion', () => {
    for (const c of CLOSING_CRITERIA) expect(isClosingCriterion(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isClosingCriterion('made_up')).toBe(false)
    expect(isClosingCriterion(123)).toBe(false)
    expect(isClosingCriterion(undefined)).toBe(false)
  })
})

describe('buildClosingJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'So we agreed adherence is the concern.')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'statement')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep statement text verbatim', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', '', 'Given what we discussed about your patients, would you be open to trying it with your next three cases?')
    expect(prompt).toContain('Given what we discussed about your patients, would you be open to trying it with your next three cases?')
  })

  it('describes all four criteria', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"summarized_agreement"')
    expect(prompt).toContain('point of agreement')
    expect(prompt).toContain('"asked_commitment"')
    expect(prompt).toContain('clear, specific closing question')
    expect(prompt).toContain('"ends_on_question"')
    expect(prompt).toContain('keep talking after')
    expect(prompt).toContain('"concise"')
  })

  it('asks for a JSON response with doctorText and criteriaHit', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"criteriaHit"')
  })
})

describe('parseClosingJudgeResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseClosingJudgeResponse('{"doctorText":"Alright.","criteriaHit":["asked_commitment","concise"]}')
    expect(parsed).toEqual({ doctorText: 'Alright.', criteriaHit: ['asked_commitment', 'concise'] })
  })

  it('strips surrounding commentary/markdown fences', () => {
    const parsed = parseClosingJudgeResponse('```json\n{"doctorText":"Fine.","criteriaHit":[]}\n```')
    expect(parsed).toEqual({ doctorText: 'Fine.', criteriaHit: [] })
  })

  it('returns null for malformed JSON', () => {
    expect(parseClosingJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"","criteriaHit":[]}')).toBeNull()
    expect(parseClosingJudgeResponse('{}')).toBeNull()
  })

  it('defaults criteriaHit to an empty array when missing', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"Fine."}')).toEqual({ doctorText: 'Fine.', criteriaHit: [] })
  })

  it('defaults criteriaHit to an empty array when not an array', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"Fine.","criteriaHit":"concise"}')).toEqual({ doctorText: 'Fine.', criteriaHit: [] })
  })

  it('filters out unknown strings from criteriaHit', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"Fine.","criteriaHit":["concise","made_up","ends_on_question"]}')).toEqual({
      doctorText: 'Fine.', criteriaHit: ['concise', 'ends_on_question'],
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- voice-partner-closing`
Expected: FAIL — `voice-partner-closing.ts` does not exist yet ("Cannot find module './voice-partner-closing'")

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice-partner-closing.ts`:

```ts
import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type ClosingCriterion = 'summarized_agreement' | 'asked_commitment' | 'ends_on_question' | 'concise'
export const CLOSING_CRITERIA: readonly ClosingCriterion[] =
  ['summarized_agreement', 'asked_commitment', 'ends_on_question', 'concise']

export function isClosingCriterion(value: unknown): value is ClosingCriterion {
  return typeof value === 'string' && (CLOSING_CRITERIA as readonly string[]).includes(value)
}

export function buildClosingJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just delivered a closing statement to end the call:
"${statementText}"

Judge this closing against these criteria and give a short in-character reaction:
- "summarized_agreement": did it recap a specific point of agreement or interest that came up earlier (generic reference is fine — "what we discussed about your patients" — no invented clinical data)?
- "asked_commitment": did it ask one clear, specific closing question — a concrete next step (a trial, a follow-up visit, a decision by a stated point) rather than a vague "what do you think"?
- "ends_on_question": did the statement end on that commitment question, without the rep continuing to talk after asking it (padding, re-justifying, or answering their own question instead of leaving room for a reply)?
- "concise": was it short and focused, not a rambling multi-point recap?

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken reaction, 1-2 sentences",
  "criteriaHit": ["summarized_agreement", "asked_commitment", "ends_on_question", "concise"]
}
"criteriaHit" = the subset of the four criteria above this statement satisfied — empty array if none.`
}

export function parseClosingJudgeResponse(text: string): { doctorText: string; criteriaHit: ClosingCriterion[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const criteriaHit: ClosingCriterion[] = Array.isArray(o.criteriaHit) ? o.criteriaHit.filter(isClosingCriterion) : []
  return { doctorText: o.doctorText, criteriaHit }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- voice-partner-closing`
Expected: PASS (all tests in `voice-partner-closing.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-partner-closing.ts src/lib/voice-partner-closing.test.ts
git commit -m "$(cat <<'EOF'
feat: add closing-statement judge prompt and parser

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 2: Migration `018_voice_partner_closing_sessions.sql`

**Files:**
- Create: `supabase/migrations/018_voice_partner_closing_sessions.sql`

**Interfaces:**
- Produces: table `public.voice_partner_closing_sessions` (columns: `id`, `rep_id`, `doctor_id`, `style`, `criteria_hit text[]`, `created_at`), consumed by Task 5's API route.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/018_voice_partner_closing_sessions.sql`:

```sql
-- Voice-partner closing-drill results: one row per completed single-shot
-- session. Like voice_partner_fab_sessions there is no outcome/turn_count
-- — the session is always exactly one take, judged once. Rows are
-- self-reported by the client (no server-side session state to validate
-- against) — a future manager-facing view must treat them as practice
-- self-reports, not audited results.
create table public.voice_partner_closing_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.voice_partner_closing_sessions enable row level security;

create policy "own voice partner closing sessions read" on public.voice_partner_closing_sessions for select using (rep_id = auth.uid());

create policy "own voice partner closing sessions insert" on public.voice_partner_closing_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner closing sessions read" on public.voice_partner_closing_sessions for select using (
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
git add supabase/migrations/018_voice_partner_closing_sessions.sql
git commit -m "$(cat <<'EOF'
feat: add voice_partner_closing_sessions table with RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

(No local apply/test step — matches this project's migration convention.)

---

### Task 3: i18n keys (EN + AR)

**Files:**
- Modify: `src/lib/i18n.tsx` (two places — the EN dictionary, currently ending its `voiceFab.*`/`visit.*` block at line 381, and the AR dictionary, currently ending its equivalent block at line 812)

**Interfaces:**
- Produces: translation keys consumed by Task 7 (`VoicePartnerClosing.tsx`) and Task 8 (`VisitPrep.tsx`).

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`, immediately after the line `'visit.voicePartnerFabNote': 'AI voice partner · features & benefits · {hit}/{total} criteria met',` (line 381), add:

```ts
  'voiceClosing.entryButton': '🤝 Practice Closing',
  'voiceClosing.teaser': "This premium feature lets you rehearse summarizing agreement with {name} and asking for a clear commitment.",
  'voiceClosing.subtitle': 'Closing practice',
  'voiceClosing.done': 'Statement recorded',
  'voiceClosing.criterion.summarized_agreement': 'Recapped a point of agreement',
  'voiceClosing.criterion.asked_commitment': 'Asked a clear, specific commitment',
  'voiceClosing.criterion.ends_on_question': 'Ended on the question — no filler after',
  'voiceClosing.criterion.concise': 'Concise — a focused close, not a recap',
  'voiceClosing.rateLimited': "You've hit the practice limit for this hour — try again later.",
  'visit.sourceVoicePartnerClosing': 'AI voice partner · closing',
  'visit.voicePartnerClosingNote': 'AI voice partner · closing · {hit}/{total} criteria met',
```

- [ ] **Step 2: Add the AR keys**

In `src/lib/i18n.tsx`, immediately after the line `'visit.voicePartnerFabNote': 'شريك صوتي بالذكاء · الميزات والفوائد · {hit}/{total} معايير محققة',` (line 812), add:

```ts
  'voiceClosing.entryButton': '🤝 تدرّب على الختام',
  'voiceClosing.teaser': 'تتيح لك هذه الميزة المميّزة التدرّب على تلخيص الاتفاق مع {name} وطلب التزام واضح.',
  'voiceClosing.subtitle': 'تدريب الختام',
  'voiceClosing.done': 'تم تسجيل الجملة',
  'voiceClosing.criterion.summarized_agreement': 'لخّصت نقطة اتفاق',
  'voiceClosing.criterion.asked_commitment': 'طلبت التزاماً واضحاً ومحدداً',
  'voiceClosing.criterion.ends_on_question': 'انتهت عند السؤال — دون كلام إضافي بعده',
  'voiceClosing.criterion.concise': 'موجزة — ختام مركّز وليس تلخيصاً',
  'voiceClosing.rateLimited': 'لقد وصلت إلى حد التدريب لهذه الساعة — حاول مرة أخرى لاحقاً.',
  'visit.sourceVoicePartnerClosing': 'شريك صوتي بالذكاء · الختام',
  'visit.voicePartnerClosingNote': 'شريك صوتي بالذكاء · الختام · {hit}/{total} معايير محققة',
```

Use the Edit tool for both insertions — do not regenerate the whole file via a shell command (this file has real Arabic text and a full-file re-save can silently corrupt the encoding in this environment; targeted Edit-tool changes only).

- [ ] **Step 3: Verify both dictionaries define the same key set**

Run: `grep -oE "^\s*'voiceClosing\.[a-zA-Z_.]+'|^\s*'visit\.(sourceVoicePartnerClosing|voicePartnerClosingNote)'" src/lib/i18n.tsx | sort | uniq -c`

Expected: every key listed exactly twice (once per language block).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "$(cat <<'EOF'
feat: add EN+AR translations for closing drill mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 4: API route `POST /api/voice-partner/closing-statement`

**Files:**
- Create: `src/app/api/voice-partner/closing-statement/route.ts`

**Interfaces:**
- Consumes: `SYSTEM`, `transcribeAudio` from `@/lib/voice-partner-core`; `buildClosingJudgePrompt`, `parseClosingJudgeResponse` from `@/lib/voice-partner-closing` (Task 1); `buildHistoryContext` from `@/lib/doctor-context`; `checkRateLimit` from `@/lib/rate-limit`; `createClient` from `@/lib/supabase-server`
- Produces: `POST` handler returning `{ repText, doctorText, criteriaHit }` on success, consumed by Task 6's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/closing-statement/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, transcribeAudio } from '@/lib/voice-partner-core'
import { buildClosingJudgePrompt, parseClosingJudgeResponse } from '@/lib/voice-partner-closing'
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

  // Shared bucket with the rest of voice partner (see fab-statement/route.ts).
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

  const prompt = buildClosingJudgePrompt(doctor as Doctor, style, lang, historyContext, repText)

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
  const judged = parseClosingJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ repText, doctorText: judged.doctorText, criteriaHit: judged.criteriaHit })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/closing-statement/route.ts
git commit -m "$(cat <<'EOF'
feat: add closing-statement route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 5: API route `POST /api/voice-partner/closing-session-result`

**Files:**
- Create: `src/app/api/voice-partner/closing-session-result/route.ts`

**Interfaces:**
- Consumes: `isClosingCriterion`, `type ClosingCriterion` from `@/lib/voice-partner-closing` (Task 1); the `voice_partner_closing_sessions` table (Task 2)
- Produces: `POST` handler inserting one session-result row, consumed by Task 6's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/closing-session-result/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isClosingCriterion, type ClosingCriterion } from '@/lib/voice-partner-closing'
import type { Doctor } from '@/types/game'

// Stricter than the AI-judge-output parsing in voice-partner-closing.ts:
// this route rejects the whole request if ANY element is invalid, rather
// than silently filtering out the bad ones.
function parseCriteriaHit(raw: unknown): ClosingCriterion[] | null {
  if (!Array.isArray(raw)) return null
  return raw.every(isClosingCriterion) ? (raw as ClosingCriterion[]) : null
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

  const { error } = await supabase.from('voice_partner_closing_sessions').insert({
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
git add src/app/api/voice-partner/closing-session-result/route.ts
git commit -m "$(cat <<'EOF'
feat: add closing drill session-result endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 6: `useVoicePartnerClosing` hook

**Files:**
- Create: `src/hooks/useVoicePartnerClosing.ts`

**Interfaces:**
- Consumes: `ClosingCriterion`, `isClosingCriterion` from `@/lib/voice-partner-closing` (Task 1); the two routes from Tasks 4-5; the existing `POST /api/voice-partner/speak` route (unchanged)
- Produces: `useVoicePartnerClosing(doctorId: string, lang: 'en' | 'ar')` returning `{ phase, result, startRecording, stopRecording, reset }` where `phase: 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'`, `result: { doctorText: string; criteriaHit: ClosingCriterion[] } | null` — consumed by Task 7's component.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useVoicePartnerClosing.ts`:

```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { ClosingCriterion } from '@/lib/voice-partner-closing'
import { isClosingCriterion } from '@/lib/voice-partner-closing'

export type VoicePartnerClosingPhase =
  | 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type VoicePartnerClosingResult = { doctorText: string; criteriaHit: ClosingCriterion[] }

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

export function useVoicePartnerClosing(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerClosingPhase>('idle')
  const [result, setResult] = useState<VoicePartnerClosingResult | null>(null)

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

  const saveSessionResult = useCallback(async (criteriaHit: ClosingCriterion[]) => {
    try {
      const res = await fetch('/api/voice-partner/closing-session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, criteriaHit }),
      })
      // Best-effort — the rep still sees their checklist either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('voice partner closing session-result save failed:', res.status)
    } catch (err) {
      console.warn('voice partner closing session-result save failed:', err)
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
      form.append('audio', blob, 'closing.webm')

      const res = await fetch('/api/voice-partner/closing-statement', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (res.status === 429) { setPhase('ratelimited'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; criteriaHit?: unknown } | null
      if (!data?.doctorText) { setPhase('error'); return }

      const criteriaHit = Array.isArray(data.criteriaHit) ? data.criteriaHit.filter(isClosingCriterion) : []
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
git add src/hooks/useVoicePartnerClosing.ts
git commit -m "$(cat <<'EOF'
feat: add useVoicePartnerClosing hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 7: `VoicePartnerClosing.tsx` component

**Files:**
- Create: `src/components/game/VoicePartnerClosing.tsx`

**Interfaces:**
- Consumes: `useVoicePartnerClosing` (Task 6); `CLOSING_CRITERIA`, `type ClosingCriterion` from `@/lib/voice-partner-closing` (Task 1); `Feedback`, `escapeHtml` from `./helpers`; i18n keys `voiceClosing.*` and reused `voice.*` keys (Task 3 + existing)
- Produces: `export default function VoicePartnerClosing({ doctor, onDone }: { doctor: Doctor; onDone: (meta: { completed: boolean; criteriaHit: ClosingCriterion[] }) => void })`, consumed by Task 8's `VisitPrep.tsx` wrapper.

- [ ] **Step 1: Write the component**

Create `src/components/game/VoicePartnerClosing.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoicePartnerClosing } from '@/hooks/useVoicePartnerClosing'
import { CLOSING_CRITERIA, type ClosingCriterion } from '@/lib/voice-partner-closing'
import { Feedback, escapeHtml } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (meta: { completed: boolean; criteriaHit: ClosingCriterion[] }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function VoicePartnerClosing({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, result, startRecording, stopRecording, reset } = useVoicePartnerClosing(doctor.id, lang)
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
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceClosing.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone({ completed: false, criteriaHit: [] })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'ratelimited' ? t('voiceClosing.rateLimited') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  const checklistHtml = result
    ? `<div>${escapeHtml(result.doctorText)}</div>` +
      `<ul style="margin:8px 0 0;padding-inline-start:18px;list-style:none">` +
      CLOSING_CRITERIA.map(crit => `<li>${result.criteriaHit.includes(crit) ? '✓' : '—'} ${escapeHtml(t(`voiceClosing.criterion.${crit}`))}</li>`).join('') +
      `</ul>`
    : ''

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('voiceClosing.subtitle')}</div>
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
            <Feedback ok={result.criteriaHit.length >= 3} title={t('voiceClosing.done')} body={checklistHtml} />
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
git add src/components/game/VoicePartnerClosing.tsx
git commit -m "$(cat <<'EOF'
feat: add VoicePartnerClosing component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 8: Wire into `VisitPrep.tsx` (view mode, entry button, doctor-visit logging)

**Files:**
- Modify: `src/types/game.ts:97` (extend `DoctorVisit['source']` union)
- Modify: `src/components/game/VisitPrep.tsx` (import component + `CLOSING_CRITERIA`, add `View` variant, add render branch, add entry button, add wrapper, extend `SOURCE_LABEL_KEY`)

**Interfaces:**
- Consumes: `VoicePartnerClosing` (Task 7), `CLOSING_CRITERIA` from `@/lib/voice-partner-closing` (Task 1), i18n keys from Task 3.
- Produces: entry point reachable from the doctor detail screen; a `voice_partner_closing` sourced row in `doctor_visits` on completion.

- [ ] **Step 1: Extend the `DoctorVisit` source union**

In `src/types/game.ts`, change line 97 from:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question' | 'voice_partner_fab'
```

to:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question' | 'voice_partner_fab' | 'voice_partner_closing'
```

- [ ] **Step 2: Import the new component and add the `View` variant**

In `src/components/game/VisitPrep.tsx`, add the import after line 21 (`import { FAB_CRITERIA } from '@/lib/voice-partner-fab'`):

```tsx
import VoicePartnerClosing from './VoicePartnerClosing'
import { CLOSING_CRITERIA } from '@/lib/voice-partner-closing'
```

Add a new variant to the `View` union (after `| { mode: 'voiceFab'; doctor: Doctor }`):

```ts
  | { mode: 'voiceClosing'; doctor: Doctor }
```

- [ ] **Step 3: Add the render branch**

Immediately after the existing FAB render branch (after the closing `}` of `if (view.mode === 'voiceFab') { ... }`, currently ending at line 113), add:

```tsx
  // ───────────────────────── AI VOICE PARTNER: CLOSING ─────────────────────────
  if (view.mode === 'voiceClosing') {
    return <VoicePartnerClosingScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 4: Add the entry button**

In the cheat-panel button list, immediately after the existing FAB button (after its closing `</button>`, currently ending at line 188), add:

```tsx
            <button onClick={() => setView({ mode: 'voiceClosing', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('voiceClosing.entryButton')} · {t('voice.premium')}
            </button>
```

- [ ] **Step 5: Add the wrapper component**

Immediately after the existing `VoicePartnerFabScreen` wrapper function (after its closing `}`, currently at line 581), add:

```tsx
// ───────────────────────── AI voice partner closing-drill wrapper (owns doctor_visits logging) ─────────────────────────
function VoicePartnerClosingScreen({ doctor, onDone }: { doctor: Doctor; onDone: () => void }) {
  const t = useT()
  const { addVisit } = useDoctorVisits(doctor.id)

  return (
    <VoicePartnerClosing
      doctor={doctor}
      onDone={(meta) => {
        if (meta.completed) {
          void addVisit({
            source: 'voice_partner_closing',
            note: t('visit.voicePartnerClosingNote', { hit: meta.criteriaHit.length, total: CLOSING_CRITERIA.length }),
          })
        }
        onDone()
      }}
    />
  )
}
```

- [ ] **Step 6: Extend `SOURCE_LABEL_KEY`**

Change the `SOURCE_LABEL_KEY` map from:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening', voice_partner_question: 'visit.sourceVoicePartnerQuestion', voice_partner_fab: 'visit.sourceVoicePartnerFab',
}
```

to:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening', voice_partner_question: 'visit.sourceVoicePartnerQuestion', voice_partner_fab: 'visit.sourceVoicePartnerFab', voice_partner_closing: 'visit.sourceVoicePartnerClosing',
}
```

- [ ] **Step 7: Commit**

```bash
git add src/types/game.ts src/components/game/VisitPrep.tsx
git commit -m "$(cat <<'EOF'
feat: wire closing drill mode into VisitPrep doctor detail screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: PASS — every existing test plus the new `voice-partner-closing.test.ts` tests from Task 1.

- [ ] **Step 2: Run a full production build to type-check the whole app**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. This is this project's only type-checking gate — it is the step that would catch a mismatched import, a missing export, or a `View`/`SOURCE_LABEL_KEY` union that isn't exhaustive.

- [ ] **Step 3: If either step fails, fix and re-run before considering the plan complete**

No commit for this task — it's a gate, not a deliverable.

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-09-08-closing-drill-mode-design.md` maps to a task — Data model → Tasks 1-2, API changes → Tasks 4-5, UI changes → Tasks 6-8, Error handling → inline in Tasks 4/5, Testing → Task 1's test file + Task 9's full-suite gate.
- **Placeholder scan:** no TBDs; every step has literal code.
- **Type consistency:** `ClosingCriterion`/`CLOSING_CRITERIA`/`isClosingCriterion` (Task 1) are the same identifiers used verbatim across Tasks 4-8. `{ completed: boolean; criteriaHit: ClosingCriterion[] }` is the one `onDone` meta shape used by both Task 7 (producer) and Task 8 (consumer), matching FAB's and Opening Statement's shape exactly (single-shot mode, no nullable extra field).
- **This is the fifth and final backlog mode from the source notes** — after this plan, the generalization trigger flagged in the FAB spec (extracting a shared `SingleShotVoiceDrill` component/hook across Opening/FAB/Closing) becomes a legitimate follow-up refactor candidate, but is explicitly out of scope for this plan (see spec's Scope section).
