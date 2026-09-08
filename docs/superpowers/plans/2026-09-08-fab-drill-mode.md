# FAB Drill Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth AI voice-partner mode — a single-turn "Features & Benefits" (FAB) drill — alongside the existing objection/CLEAR, opening-statement, and question-drill modes.

**Architecture:** New standalone core module (`voice-partner-fab.ts`) holds one judge prompt/parser, following the exact shape of `voice-partner-opening.ts` (single AI-judged take, 4-item checklist rubric, no turn loop, no verdict machine). One API route for the statement + judge call, one session-result route, a single-shot hook, a component, a DB table, EN/AR i18n, and wiring into the existing doctor-detail screen.

**Tech Stack:** Next.js (App Router) API routes, React hooks/components, Supabase (Postgres + RLS), Anthropic Claude (judge), OpenAI Whisper (transcription), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-fab-drill-mode-design.md`

## Global Constraints

- No invented clinical data, statistics, dosages, or real/branded drug names anywhere in AI-facing prompts or judge output — reuse the existing `SYSTEM` guardrail constant, do not restate or diverge from it.
- Product is referred to only as "your product"; evidence only in generic terms (e.g. "the evidence pack").
- Same rate-limit bucket as the rest of voice partner: `checkRateLimit('voice-partner', user.id, 20, 3600)` on every new route.
- Same env gate as the rest of voice partner: `process.env.AI_VOICE_PARTNER_ENABLED !== 'true'` (plus missing API keys on the judge route) → `503 { error: 'not_configured' }` before any other check.
- Never trust client-supplied `style` — always look it up server-side from the `doctors` row.
- A failed session-result save must never block the rep from seeing their result screen (log + swallow).
- `criteriaHit` parsing is lenient (degrade to `[]` on missing/non-array/unknown-string elements) — `doctorText` is the only field that gates the whole parse. This matches `voice-partner-opening.ts`, not `voice-partner-questioning.ts`'s stricter `questionType` field (that field is a single required classification; `criteriaHit` is an accumulating checklist, same category as `voice-partner-opening.ts`'s `criteriaHit`).
- Any component in this mode that builds an HTML string for `Feedback`'s `body` prop MUST escape every dynamic interpolation (AI-generated text, computed i18n lookups) using the shared `escapeHtml` helper from `src/components/game/helpers.tsx` — this app has an established XSS class of defect in this exact pattern (found and fixed in Opening Statement mode).
- No API-route or migration test files — this project's convention is `*-core.ts`/`*.test.ts` lib-level unit tests only.
- Use the Edit tool for i18n.tsx insertions — do not regenerate the whole file via a shell command (this file has real Arabic text and a full-file re-save can silently corrupt the encoding in this environment).

---

### Task 1: `voice-partner-fab.ts` core module (types, judge prompt, parser)

**Files:**
- Create: `src/lib/voice-partner-fab.ts`
- Test: `src/lib/voice-partner-fab.test.ts`

**Interfaces:**
- Consumes: `personaLines` from `@/lib/voice-partner-core`; `Doctor`, `StyleKey` from `@/types/game`
- Produces: `export type FabCriterion = 'feature_stated' | 'benefit_linked' | 'tailored' | 'patient_centered'`
- Produces: `export const FAB_CRITERIA: readonly FabCriterion[]`
- Produces: `export function isFabCriterion(value: unknown): value is FabCriterion`
- Produces: `export function buildFabJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string): string`
- Produces: `export function parseFabJudgeResponse(text: string): { doctorText: string; criteriaHit: FabCriterion[] } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice-partner-fab.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  FAB_CRITERIA, isFabCriterion,
  buildFabJudgePrompt, parseFabJudgeResponse,
} from './voice-partner-fab'
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

describe('isFabCriterion', () => {
  it('accepts each valid criterion', () => {
    for (const c of FAB_CRITERIA) expect(isFabCriterion(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isFabCriterion('made_up')).toBe(false)
    expect(isFabCriterion(123)).toBe(false)
    expect(isFabCriterion(undefined)).toBe(false)
  })
})

describe('buildFabJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'Let me tell you about your product.')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'statement')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep statement text verbatim', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', '', 'Your product has a once-daily formulation, which means better adherence for your elderly patients.')
    expect(prompt).toContain('Your product has a once-daily formulation, which means better adherence for your elderly patients.')
  })

  it('describes all four criteria', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"feature_stated"')
    expect(prompt).toContain('concrete product feature or characteristic')
    expect(prompt).toContain('"benefit_linked"')
    expect(prompt).toContain('outcome or benefit')
    expect(prompt).toContain('"tailored"')
    expect(prompt).toContain("this doctor's patient")
    expect(prompt).toContain('"patient_centered"')
    expect(prompt).toContain('around the patient')
  })

  it('asks for a JSON response with doctorText and criteriaHit', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"criteriaHit"')
  })
})

describe('parseFabJudgeResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseFabJudgeResponse('{"doctorText":"Go on.","criteriaHit":["feature_stated","tailored"]}')
    expect(parsed).toEqual({ doctorText: 'Go on.', criteriaHit: ['feature_stated', 'tailored'] })
  })

  it('strips surrounding commentary/markdown fences', () => {
    const parsed = parseFabJudgeResponse('```json\n{"doctorText":"Interesting.","criteriaHit":[]}\n```')
    expect(parsed).toEqual({ doctorText: 'Interesting.', criteriaHit: [] })
  })

  it('returns null for malformed JSON', () => {
    expect(parseFabJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseFabJudgeResponse('{"doctorText":"","criteriaHit":[]}')).toBeNull()
    expect(parseFabJudgeResponse('{}')).toBeNull()
  })

  it('defaults criteriaHit to an empty array when missing', () => {
    expect(parseFabJudgeResponse('{"doctorText":"Go on."}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('defaults criteriaHit to an empty array when not an array', () => {
    expect(parseFabJudgeResponse('{"doctorText":"Go on.","criteriaHit":"feature_stated"}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('filters out unknown strings from criteriaHit', () => {
    expect(parseFabJudgeResponse('{"doctorText":"Go on.","criteriaHit":["feature_stated","made_up","patient_centered"]}')).toEqual({
      doctorText: 'Go on.', criteriaHit: ['feature_stated', 'patient_centered'],
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- voice-partner-fab`
Expected: FAIL — `voice-partner-fab.ts` does not exist yet ("Cannot find module './voice-partner-fab'")

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice-partner-fab.ts`:

```ts
import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type FabCriterion = 'feature_stated' | 'benefit_linked' | 'tailored' | 'patient_centered'
export const FAB_CRITERIA: readonly FabCriterion[] =
  ['feature_stated', 'benefit_linked', 'tailored', 'patient_centered']

export function isFabCriterion(value: unknown): value is FabCriterion {
  return typeof value === 'string' && (FAB_CRITERIA as readonly string[]).includes(value)
}

export function buildFabJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just delivered a features-and-benefits statement about their product:
"${statementText}"

Judge this statement against these criteria and give a short in-character reaction:
- "feature_stated": did it name a concrete product feature or characteristic (generic — "your product's formulation", "the delivery mechanism" — never an invented or branded drug name, never a specific clinical claim or statistic)?
- "benefit_linked": did it connect that feature to an outcome or benefit, rather than just restating the feature in different words?
- "tailored": did it tie the benefit to this doctor's patient type or need, given their specialty and any visit history above?
- "patient_centered": did it frame the benefit around the patient, rather than solely around the rep's or company's interest?

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken reaction, 1-2 sentences",
  "criteriaHit": ["feature_stated", "benefit_linked", "tailored", "patient_centered"]
}
"criteriaHit" = the subset of the four criteria above this statement satisfied — empty array if none.`
}

export function parseFabJudgeResponse(text: string): { doctorText: string; criteriaHit: FabCriterion[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const criteriaHit: FabCriterion[] = Array.isArray(o.criteriaHit) ? o.criteriaHit.filter(isFabCriterion) : []
  return { doctorText: o.doctorText, criteriaHit }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- voice-partner-fab`
Expected: PASS (all tests in `voice-partner-fab.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-partner-fab.ts src/lib/voice-partner-fab.test.ts
git commit -m "$(cat <<'EOF'
feat: add FAB-statement judge prompt and parser

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 2: Migration `017_voice_partner_fab_sessions.sql`

**Files:**
- Create: `supabase/migrations/017_voice_partner_fab_sessions.sql`

**Interfaces:**
- Produces: table `public.voice_partner_fab_sessions` (columns: `id`, `rep_id`, `doctor_id`, `style`, `criteria_hit text[]`, `created_at`), consumed by Task 5's API route.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/017_voice_partner_fab_sessions.sql`:

```sql
-- Voice-partner FAB (Features & Benefits) drill results: one row per
-- completed single-shot session. Like voice_partner_opening_sessions
-- there is no outcome/turn_count — the session is always exactly one
-- take, judged once. Rows are self-reported by the client (no
-- server-side session state to validate against) — a future
-- manager-facing view must treat them as practice self-reports, not
-- audited results.
create table public.voice_partner_fab_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.voice_partner_fab_sessions enable row level security;

create policy "own voice partner fab sessions read" on public.voice_partner_fab_sessions for select using (rep_id = auth.uid());

create policy "own voice partner fab sessions insert" on public.voice_partner_fab_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner fab sessions read" on public.voice_partner_fab_sessions for select using (
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
git add supabase/migrations/017_voice_partner_fab_sessions.sql
git commit -m "$(cat <<'EOF'
feat: add voice_partner_fab_sessions table with RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

(No local apply/test step — matches this project's migration convention.)

---

### Task 3: i18n keys (EN + AR)

**Files:**
- Modify: `src/lib/i18n.tsx` (two places — the EN dictionary, currently ending its `voiceQuestion.*`/`visit.*` block at line 370, and the AR dictionary, currently ending its equivalent block at line 790)

**Interfaces:**
- Produces: translation keys consumed by Task 7 (`VoicePartnerFab.tsx`) and Task 8 (`VisitPrep.tsx`).

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`, immediately after the line `'visit.voicePartnerQuestionNote': 'AI voice partner · questioning drill · {type} · {hit}/{total} listening cues',` (line 370), add:

```ts
  'voiceFab.entryButton': '💊 Practice Features & Benefits',
  'voiceFab.teaser': "This premium feature lets you rehearse presenting a feature and its benefit to {name}, tailored to their patients.",
  'voiceFab.subtitle': 'Features & benefits practice',
  'voiceFab.done': 'Statement recorded',
  'voiceFab.criterion.feature_stated': 'Named a concrete product feature',
  'voiceFab.criterion.benefit_linked': 'Connected the feature to a benefit',
  'voiceFab.criterion.tailored': "Tailored to this doctor's patients",
  'voiceFab.criterion.patient_centered': 'Framed around the patient',
  'voiceFab.rateLimited': "You've hit the practice limit for this hour — try again later.",
  'visit.sourceVoicePartnerFab': 'AI voice partner · features & benefits',
  'visit.voicePartnerFabNote': 'AI voice partner · features & benefits · {hit}/{total} criteria met',
```

- [ ] **Step 2: Add the AR keys**

In `src/lib/i18n.tsx`, immediately after the line `'visit.voicePartnerQuestionNote': 'شريك صوتي بالذكاء · تدريب الأسئلة · {type} · {hit}/{total} إشارات إصغاء',` (line 790), add:

```ts
  'voiceFab.entryButton': '💊 تدرّب على الميزات والفوائد',
  'voiceFab.teaser': 'تتيح لك هذه الميزة المميّزة التدرّب على عرض ميزة وفائدتها أمام {name}، بما يتناسب مع مرضاه.',
  'voiceFab.subtitle': 'تدريب الميزات والفوائد',
  'voiceFab.done': 'تم تسجيل الجملة',
  'voiceFab.criterion.feature_stated': 'ذكرت ميزة محددة للمنتج',
  'voiceFab.criterion.benefit_linked': 'ربطت الميزة بفائدة',
  'voiceFab.criterion.tailored': 'مناسبة لمرضى هذا الطبيب',
  'voiceFab.criterion.patient_centered': 'محورها المريض',
  'voiceFab.rateLimited': 'لقد وصلت إلى حد التدريب لهذه الساعة — حاول مرة أخرى لاحقاً.',
  'visit.sourceVoicePartnerFab': 'شريك صوتي بالذكاء · الميزات والفوائد',
  'visit.voicePartnerFabNote': 'شريك صوتي بالذكاء · الميزات والفوائد · {hit}/{total} معايير محققة',
```

Use the Edit tool for both insertions — do not regenerate the whole file via a shell command (this file has real Arabic text and a full-file re-save can silently corrupt the encoding in this environment; targeted Edit-tool changes only).

- [ ] **Step 3: Verify both dictionaries define the same key set**

Run: `grep -oE "^\s*'voiceFab\.[a-zA-Z_.]+'|^\s*'visit\.(sourceVoicePartnerFab|voicePartnerFabNote)'" src/lib/i18n.tsx | sort | uniq -c`

Expected: every key listed exactly twice (once per language block).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "$(cat <<'EOF'
feat: add EN+AR translations for FAB drill mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 4: API route `POST /api/voice-partner/fab-statement`

**Files:**
- Create: `src/app/api/voice-partner/fab-statement/route.ts`

**Interfaces:**
- Consumes: `SYSTEM`, `transcribeAudio` from `@/lib/voice-partner-core`; `buildFabJudgePrompt`, `parseFabJudgeResponse` from `@/lib/voice-partner-fab` (Task 1); `buildHistoryContext` from `@/lib/doctor-context`; `checkRateLimit` from `@/lib/rate-limit`; `createClient` from `@/lib/supabase-server`
- Produces: `POST` handler returning `{ repText, doctorText, criteriaHit }` on success, consumed by Task 6's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/fab-statement/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, transcribeAudio } from '@/lib/voice-partner-core'
import { buildFabJudgePrompt, parseFabJudgeResponse } from '@/lib/voice-partner-fab'
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

  // Shared bucket with the rest of voice partner (see opening-statement/route.ts).
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

  const prompt = buildFabJudgePrompt(doctor as Doctor, style, lang, historyContext, repText)

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
  const judged = parseFabJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ repText, doctorText: judged.doctorText, criteriaHit: judged.criteriaHit })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/fab-statement/route.ts
git commit -m "$(cat <<'EOF'
feat: add FAB-statement route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 5: API route `POST /api/voice-partner/fab-session-result`

**Files:**
- Create: `src/app/api/voice-partner/fab-session-result/route.ts`

**Interfaces:**
- Consumes: `isFabCriterion`, `type FabCriterion` from `@/lib/voice-partner-fab` (Task 1); the `voice_partner_fab_sessions` table (Task 2)
- Produces: `POST` handler inserting one session-result row, consumed by Task 6's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/fab-session-result/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isFabCriterion, type FabCriterion } from '@/lib/voice-partner-fab'
import type { Doctor } from '@/types/game'

// Stricter than the AI-judge-output parsing in voice-partner-fab.ts: this
// route rejects the whole request if ANY element is invalid, rather than
// silently filtering out the bad ones.
function parseCriteriaHit(raw: unknown): FabCriterion[] | null {
  if (!Array.isArray(raw)) return null
  return raw.every(isFabCriterion) ? (raw as FabCriterion[]) : null
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

  const { error } = await supabase.from('voice_partner_fab_sessions').insert({
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
git add src/app/api/voice-partner/fab-session-result/route.ts
git commit -m "$(cat <<'EOF'
feat: add FAB drill session-result endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 6: `useVoicePartnerFab` hook

**Files:**
- Create: `src/hooks/useVoicePartnerFab.ts`

**Interfaces:**
- Consumes: `FabCriterion`, `isFabCriterion` from `@/lib/voice-partner-fab` (Task 1); the two routes from Tasks 4-5; the existing `POST /api/voice-partner/speak` route (unchanged)
- Produces: `useVoicePartnerFab(doctorId: string, lang: 'en' | 'ar')` returning `{ phase, result, startRecording, stopRecording, reset }` where `phase: 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'`, `result: { doctorText: string; criteriaHit: FabCriterion[] } | null` — consumed by Task 7's component.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useVoicePartnerFab.ts`:

```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { FabCriterion } from '@/lib/voice-partner-fab'
import { isFabCriterion } from '@/lib/voice-partner-fab'

export type VoicePartnerFabPhase =
  | 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type VoicePartnerFabResult = { doctorText: string; criteriaHit: FabCriterion[] }

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

export function useVoicePartnerFab(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerFabPhase>('idle')
  const [result, setResult] = useState<VoicePartnerFabResult | null>(null)

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

  const saveSessionResult = useCallback(async (criteriaHit: FabCriterion[]) => {
    try {
      const res = await fetch('/api/voice-partner/fab-session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, criteriaHit }),
      })
      // Best-effort — the rep still sees their checklist either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('voice partner FAB session-result save failed:', res.status)
    } catch (err) {
      console.warn('voice partner FAB session-result save failed:', err)
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
      form.append('audio', blob, 'fab.webm')

      const res = await fetch('/api/voice-partner/fab-statement', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (res.status === 429) { setPhase('ratelimited'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; criteriaHit?: unknown } | null
      if (!data?.doctorText) { setPhase('error'); return }

      const criteriaHit = Array.isArray(data.criteriaHit) ? data.criteriaHit.filter(isFabCriterion) : []
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
git add src/hooks/useVoicePartnerFab.ts
git commit -m "$(cat <<'EOF'
feat: add useVoicePartnerFab hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 7: `VoicePartnerFab.tsx` component

**Files:**
- Create: `src/components/game/VoicePartnerFab.tsx`

**Interfaces:**
- Consumes: `useVoicePartnerFab` (Task 6); `FAB_CRITERIA`, `type FabCriterion` from `@/lib/voice-partner-fab` (Task 1); `Feedback`, `escapeHtml` from `./helpers`; i18n keys `voiceFab.*` and reused `voice.*` keys (Task 3 + existing)
- Produces: `export default function VoicePartnerFab({ doctor, onDone }: { doctor: Doctor; onDone: (meta: { completed: boolean; criteriaHit: FabCriterion[] }) => void })`, consumed by Task 8's `VisitPrep.tsx` wrapper.

- [ ] **Step 1: Write the component**

Create `src/components/game/VoicePartnerFab.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoicePartnerFab } from '@/hooks/useVoicePartnerFab'
import { FAB_CRITERIA, type FabCriterion } from '@/lib/voice-partner-fab'
import { Feedback, escapeHtml } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (meta: { completed: boolean; criteriaHit: FabCriterion[] }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function VoicePartnerFab({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, result, startRecording, stopRecording, reset } = useVoicePartnerFab(doctor.id, lang)
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
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceFab.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone({ completed: false, criteriaHit: [] })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'ratelimited' ? t('voiceFab.rateLimited') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  const checklistHtml = result
    ? `<div>${escapeHtml(result.doctorText)}</div>` +
      `<ul style="margin:8px 0 0;padding-inline-start:18px;list-style:none">` +
      FAB_CRITERIA.map(crit => `<li>${result.criteriaHit.includes(crit) ? '✓' : '—'} ${escapeHtml(t(`voiceFab.criterion.${crit}`))}</li>`).join('') +
      `</ul>`
    : ''

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('voiceFab.subtitle')}</div>
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
            <Feedback ok={result.criteriaHit.length >= 3} title={t('voiceFab.done')} body={checklistHtml} />
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
git add src/components/game/VoicePartnerFab.tsx
git commit -m "$(cat <<'EOF'
feat: add VoicePartnerFab component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 8: Wire into `VisitPrep.tsx` (view mode, entry button, doctor-visit logging)

**Files:**
- Modify: `src/types/game.ts:97` (extend `DoctorVisit['source']` union)
- Modify: `src/components/game/VisitPrep.tsx` (import component + `FAB_CRITERIA`, add `View` variant, add render branch, add entry button, add wrapper, extend `SOURCE_LABEL_KEY`)

**Interfaces:**
- Consumes: `VoicePartnerFab` (Task 7), `FAB_CRITERIA` from `@/lib/voice-partner-fab` (Task 1), i18n keys from Task 3.
- Produces: entry point reachable from the doctor detail screen; a `voice_partner_fab` sourced row in `doctor_visits` on completion.

- [ ] **Step 1: Extend the `DoctorVisit` source union**

In `src/types/game.ts`, change line 97 from:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question'
```

to:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question' | 'voice_partner_fab'
```

- [ ] **Step 2: Import the new component and add the `View` variant**

In `src/components/game/VisitPrep.tsx`, add the import after line 19 (`import { LISTENING_CUES } from '@/lib/voice-partner-questioning'`):

```tsx
import VoicePartnerFab from './VoicePartnerFab'
import { FAB_CRITERIA } from '@/lib/voice-partner-fab'
```

Add a new variant to the `View` union (after `| { mode: 'questionDrill'; doctor: Doctor }`):

```ts
  | { mode: 'voiceFab'; doctor: Doctor }
```

- [ ] **Step 3: Add the render branch**

Immediately after the existing question-drill render branch (after the closing `}` of `if (view.mode === 'questionDrill') { ... }`, currently ending at line 105), add:

```tsx
  // ───────────────────────── AI VOICE PARTNER: FEATURES & BENEFITS ─────────────────────────
  if (view.mode === 'voiceFab') {
    return <VoicePartnerFabScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 4: Add the entry button**

In the cheat-panel button list, immediately after the existing question-drill button (after its closing `</button>`, currently ending at line 176), add:

```tsx
            <button onClick={() => setView({ mode: 'voiceFab', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('voiceFab.entryButton')} · {t('voice.premium')}
            </button>
```

- [ ] **Step 5: Add the wrapper component**

Immediately after the existing `QuestionDrillScreen` wrapper function (after its closing `}`, currently at line 548), add:

```tsx
// ───────────────────────── AI voice partner FAB-drill wrapper (owns doctor_visits logging) ─────────────────────────
function VoicePartnerFabScreen({ doctor, onDone }: { doctor: Doctor; onDone: () => void }) {
  const t = useT()
  const { addVisit } = useDoctorVisits(doctor.id)

  return (
    <VoicePartnerFab
      doctor={doctor}
      onDone={(meta) => {
        if (meta.completed) {
          void addVisit({
            source: 'voice_partner_fab',
            note: t('visit.voicePartnerFabNote', { hit: meta.criteriaHit.length, total: FAB_CRITERIA.length }),
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
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening', voice_partner_question: 'visit.sourceVoicePartnerQuestion',
}
```

to:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening', voice_partner_question: 'visit.sourceVoicePartnerQuestion', voice_partner_fab: 'visit.sourceVoicePartnerFab',
}
```

- [ ] **Step 7: Commit**

```bash
git add src/types/game.ts src/components/game/VisitPrep.tsx
git commit -m "$(cat <<'EOF'
feat: wire FAB drill mode into VisitPrep doctor detail screen

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
Expected: PASS — every existing test plus the new `voice-partner-fab.test.ts` tests from Task 1.

- [ ] **Step 2: Run a full production build to type-check the whole app**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. This is this project's only type-checking gate — it is the step that would catch a mismatched import, a missing export, or a `View`/`SOURCE_LABEL_KEY` union that isn't exhaustive.

- [ ] **Step 3: If either step fails, fix and re-run before considering the plan complete**

No commit for this task — it's a gate, not a deliverable.

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-09-08-fab-drill-mode-design.md` maps to a task — Data model → Tasks 1-2, API changes → Tasks 4-5, UI changes → Tasks 6-8, Error handling → inline in Tasks 4/5 (matching the spec's route-level error contract), Testing → Task 1's test file + Task 9's full-suite gate.
- **Placeholder scan:** no TBDs; every step has literal code.
- **Type consistency:** `FabCriterion`/`FAB_CRITERIA`/`isFabCriterion` (Task 1) are the same identifiers used verbatim across Tasks 4-8. `{ completed: boolean; criteriaHit: FabCriterion[] }` is the one `onDone` meta shape used by both Task 7 (producer) and Task 8 (consumer), matching Opening Statement mode's shape exactly (no nullable extra field needed here since, unlike Question Drill, there's no multi-turn state to be mid-way through).
