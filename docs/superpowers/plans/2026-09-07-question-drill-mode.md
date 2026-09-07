# Question Drill Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third AI voice-partner mode — a fixed 2-turn "forbidden/effective questions" drill — alongside the existing objection/CLEAR mode and Opening Statement mode.

**Architecture:** New standalone core module (`voice-partner-questioning.ts`) holds two judge prompts/parsers — one per fixed turn. Turn 1: rep asks a question, AI classifies it (5 archetypes: 2 forbidden, 2 effective, 1 catch-all) and answers in character. Turn 2: rep responds to the doctor's answer, AI scores active-listening cues (3 items). No loop, no turn cap, no win/escalate verdict — exactly two beats then done. Two API routes (one per turn) plus a session-result route, a two-stage hook, a component, a DB table, EN/AR i18n, and wiring into the existing doctor-detail screen. Also hoists the `escapeHtml` helper (added to Opening Statement mode after a security review) into a shared location, since this mode's component needs the identical fix for the identical reason.

**Tech Stack:** Next.js (App Router) API routes, React hooks/components, Supabase (Postgres + RLS), Anthropic Claude (judge), OpenAI Whisper (transcription), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-question-drill-mode-design.md`

## Global Constraints

- No invented clinical data, statistics, dosages, or real/branded drug names anywhere in AI-facing prompts or judge output — reuse the existing `SYSTEM` guardrail constant, do not restate or diverge from it.
- Product is referred to only as "your product"; evidence only in generic terms.
- Same rate-limit bucket as the rest of voice partner: `checkRateLimit('voice-partner', user.id, 20, 3600)` on every new route.
- Same env gate as the rest of voice partner: `process.env.AI_VOICE_PARTNER_ENABLED !== 'true'` (plus missing API keys) → `503 { error: 'not_configured' }` before any other check.
- Never trust client-supplied `style` — always look it up server-side from the `doctors` row.
- A failed session-result save must never block the rep from seeing their result screen (log + swallow).
- **`questionType` parsing is strict, not lenient**: `parseQuestionJudgeResponse` must return `null` (fail the whole parse) if `questionType` is missing or not one of the 5 valid values — this is a deliberate deviation from the lenient-degrade-to-`[]` pattern used for `listeningCuesHit`/`criteriaHit`/`clearSteps` elsewhere in this app, because `questionType` is a required single classification, not an accumulating checklist. Do not "fix" this into a lenient default — it is intentional, explained in the spec's Data Model and Error Handling sections.
- Any component in this mode that builds an HTML string for `Feedback`'s `body` prop MUST escape every dynamic interpolation (AI-generated text, computed i18n lookups) — this app has an established XSS class of defect in this exact pattern (found and fixed in Opening Statement mode). Use the shared `escapeHtml` helper from Task 1, never reimplement it.
- No API-route or migration test files — this project's convention is `*-core.ts`/`*.test.ts` lib-level unit tests only.

---

### Task 1: Hoist `escapeHtml` into `helpers.tsx`

**Files:**
- Modify: `src/components/game/helpers.tsx` (add `escapeHtml` export)
- Modify: `src/components/game/VoicePartnerOpening.tsx:14-16` (remove local definition, import from helpers instead)
- Test: none (this file has no test convention — it's a component, matching the rest of `game/*.tsx`)

**Interfaces:**
- Produces: `export function escapeHtml(s: string): string`, consumed by Task 9's `QuestionDrill.tsx` and by the now-updated `VoicePartnerOpening.tsx`.

- [ ] **Step 1: Add `escapeHtml` to `helpers.tsx`**

In `src/components/game/helpers.tsx`, add this function immediately before `export function Feedback`:

```ts
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
```

- [ ] **Step 2: Update `VoicePartnerOpening.tsx` to import it instead of defining it locally**

In `src/components/game/VoicePartnerOpening.tsx`, remove these three lines (currently 14-16):

```ts
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
```

And change the import line (currently `import { Feedback } from './helpers'`) to:

```ts
import { Feedback, escapeHtml } from './helpers'
```

- [ ] **Step 3: Run the full test suite and confirm nothing broke**

Run: `npm test`
Expected: PASS (87/87, unchanged — this is a pure refactor with no test file of its own)

- [ ] **Step 4: Run a production build to confirm the refactor typechecks**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/helpers.tsx src/components/game/VoicePartnerOpening.tsx
git commit -m "$(cat <<'EOF'
refactor: hoist escapeHtml into shared helpers for reuse by question-drill mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 2: `voice-partner-questioning.ts` core module (types, 2 judge prompts, 2 parsers)

**Files:**
- Create: `src/lib/voice-partner-questioning.ts`
- Test: `src/lib/voice-partner-questioning.test.ts`

**Interfaces:**
- Consumes: `personaLines` from `@/lib/voice-partner-core`; `Doctor`, `StyleKey` from `@/types/game`
- Produces: `export type QuestionType = 'forbidden_reason' | 'forbidden_indication' | 'effective_challenges' | 'effective_criteria' | 'other'`
- Produces: `export const QUESTION_TYPES: readonly QuestionType[]`
- Produces: `export function isQuestionType(value: unknown): value is QuestionType`
- Produces: `export type ListeningCue = 'restated' | 'paraphrased' | 'validatedFeelings'`
- Produces: `export const LISTENING_CUES: readonly ListeningCue[]`
- Produces: `export function isListeningCue(value: unknown): value is ListeningCue`
- Produces: `export function buildQuestionJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, questionText: string): string`
- Produces: `export function parseQuestionJudgeResponse(text: string): { doctorText: string; questionType: QuestionType } | null`
- Produces: `export function buildListeningJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, questionText: string, doctorAnswer: string, questionType: QuestionType, repResponseText: string): string`
- Produces: `export function parseListeningJudgeResponse(text: string): { doctorText: string; listeningCuesHit: ListeningCue[] } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice-partner-questioning.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  QUESTION_TYPES, isQuestionType,
  LISTENING_CUES, isListeningCue,
  buildQuestionJudgePrompt, parseQuestionJudgeResponse,
  buildListeningJudgePrompt, parseListeningJudgeResponse,
} from './voice-partner-questioning'
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

describe('isQuestionType', () => {
  it('accepts each valid question type', () => {
    for (const q of QUESTION_TYPES) expect(isQuestionType(q)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isQuestionType('made_up')).toBe(false)
    expect(isQuestionType(123)).toBe(false)
    expect(isQuestionType(undefined)).toBe(false)
  })
})

describe('isListeningCue', () => {
  it('accepts each valid cue', () => {
    for (const c of LISTENING_CUES) expect(isListeningCue(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isListeningCue('made_up')).toBe(false)
    expect(isListeningCue(123)).toBe(false)
  })
})

describe('buildQuestionJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'What challenges do your patients face?')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'question')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep question text verbatim', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', '', 'What criteria do you look for when choosing a medication here?')
    expect(prompt).toContain('What criteria do you look for when choosing a medication here?')
  })

  it('describes all five question types including the catch-all', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', '', 'question')
    expect(prompt).toContain('"forbidden_reason"')
    expect(prompt).toContain('rehearse and reinforce')
    expect(prompt).toContain('"forbidden_indication"')
    expect(prompt).toContain('puts you on the spot')
    expect(prompt).toContain('"effective_challenges"')
    expect(prompt).toContain('challenges or problems')
    expect(prompt).toContain('"effective_criteria"')
    expect(prompt).toContain('criteria or factors')
    expect(prompt).toContain('"other"')
  })

  it('asks for a JSON response with doctorText and questionType', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', '', 'question')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"questionType"')
  })
})

describe('parseQuestionJudgeResponse', () => {
  it('parses a valid response', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"Good question.","questionType":"effective_criteria"}')).toEqual({
      doctorText: 'Good question.', questionType: 'effective_criteria',
    })
  })

  it('strips surrounding commentary/markdown fences', () => {
    expect(parseQuestionJudgeResponse('```json\n{"doctorText":"Hmm.","questionType":"other"}\n```')).toEqual({
      doctorText: 'Hmm.', questionType: 'other',
    })
  })

  it('returns null for malformed JSON', () => {
    expect(parseQuestionJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"","questionType":"other"}')).toBeNull()
    expect(parseQuestionJudgeResponse('{"questionType":"other"}')).toBeNull()
  })

  it('returns null when questionType is missing (strict, not defaulted)', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"Answer."}')).toBeNull()
  })

  it('returns null when questionType is invalid (strict, not defaulted)', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"Answer.","questionType":"made_up"}')).toBeNull()
  })
})

describe('buildListeningJudgePrompt', () => {
  it('includes the turn-1 exchange and the rep turn-2 response', () => {
    const prompt = buildListeningJudgePrompt(
      doctorFixture(), 'driver', 'en', '',
      'What challenges do your patients face?', 'Adherence is a big one.', 'effective_challenges',
      'So adherence is the main challenge you see?',
    )
    expect(prompt).toContain('What challenges do your patients face?')
    expect(prompt).toContain('Adherence is a big one.')
    expect(prompt).toContain('So adherence is the main challenge you see?')
  })

  it('describes all three listening cues including the last-few-words technique', () => {
    const prompt = buildListeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'q', 'a', 'other', 'reply')
    expect(prompt).toContain('"restated"')
    expect(prompt).toContain('repeating your last few words')
    expect(prompt).toContain('"paraphrased"')
    expect(prompt).toContain('"validatedFeelings"')
  })

  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildListeningJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'q', 'a', 'other', 'reply')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })
})

describe('parseListeningJudgeResponse', () => {
  it('parses a valid response', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Yes, exactly.","listeningCuesHit":["restated","validatedFeelings"]}')).toEqual({
      doctorText: 'Yes, exactly.', listeningCuesHit: ['restated', 'validatedFeelings'],
    })
  })

  it('returns null for malformed JSON', () => {
    expect(parseListeningJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"","listeningCuesHit":[]}')).toBeNull()
  })

  it('defaults listeningCuesHit to an empty array when missing', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Ok."}')).toEqual({ doctorText: 'Ok.', listeningCuesHit: [] })
  })

  it('defaults listeningCuesHit to an empty array when not an array', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Ok.","listeningCuesHit":"restated"}')).toEqual({ doctorText: 'Ok.', listeningCuesHit: [] })
  })

  it('filters out unknown strings from listeningCuesHit', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Ok.","listeningCuesHit":["restated","made_up","paraphrased"]}')).toEqual({
      doctorText: 'Ok.', listeningCuesHit: ['restated', 'paraphrased'],
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- voice-partner-questioning`
Expected: FAIL — `voice-partner-questioning.ts` does not exist yet ("Cannot find module './voice-partner-questioning'")

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice-partner-questioning.ts`:

```ts
import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type QuestionType = 'forbidden_reason' | 'forbidden_indication' | 'effective_challenges' | 'effective_criteria' | 'other'
export const QUESTION_TYPES: readonly QuestionType[] =
  ['forbidden_reason', 'forbidden_indication', 'effective_challenges', 'effective_criteria', 'other']

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value)
}

export type ListeningCue = 'restated' | 'paraphrased' | 'validatedFeelings'
export const LISTENING_CUES: readonly ListeningCue[] = ['restated', 'paraphrased', 'validatedFeelings']

export function isListeningCue(value: unknown): value is ListeningCue {
  return typeof value === 'string' && (LISTENING_CUES as readonly string[]).includes(value)
}

export function buildQuestionJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, questionText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just asked you this question, right after their opening statement:
"${questionText}"

Classify the question against these five types and answer it in character:
- "forbidden_reason": a leading question like "why are you prescribing what you currently prescribe?" — it makes you rehearse and reinforce your own existing reasons rather than opening anything new.
- "forbidden_indication": a question like "in this indication/these cases, what would you prescribe?" — it puts you on the spot about your own decision-making.
- "effective_challenges": an open question about what challenges or problems your patients in this area face.
- "effective_criteria": an open question about what criteria or factors you look for when choosing a medication in this situation.
- "other": anything that doesn't clearly fit one of the above (small talk, a closed yes/no question, an off-topic question).

Answer according to the type: for "forbidden_reason", confidently restate your own existing reasoning, unmoved. For "forbidden_indication", answer vaguely, sounding slightly put on the spot. For "effective_challenges", answer with a concrete patient need or challenge (generic, no invented clinical specifics). For "effective_criteria", answer with the actual selection factors you weigh. For "other", answer briefly and without much enthusiasm.

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken answer, 1-3 sentences",
  "questionType": "forbidden_reason" | "forbidden_indication" | "effective_challenges" | "effective_criteria" | "other"
}`
}

export function parseQuestionJudgeResponse(text: string): { doctorText: string; questionType: QuestionType } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  if (!isQuestionType(o.questionType)) return null
  return { doctorText: o.doctorText, questionType: o.questionType }
}

export function buildListeningJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string,
  questionText: string, doctorAnswer: string, questionType: QuestionType, repResponseText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

Earlier in this conversation:
Rep asked: "${questionText}"
You answered: "${doctorAnswer}"

The rep has now replied to your answer:
"${repResponseText}"

Judge this reply for active listening and give a short in-character close. Identify which of these techniques the rep's reply demonstrated:
- "restated": repeated back or restated what you said, including techniques like repeating your last few words.
- "paraphrased": reflected the meaning of what you said back in their own words (distinct from restating it verbatim).
- "validatedFeelings": acknowledged how you feel or think about this, not just what you said.

Return JSON exactly in this shape:
{
  "doctorText": "a short in-character close, 1-2 sentences — does the doctor feel heard or brushed past",
  "listeningCuesHit": ["restated", "paraphrased", "validatedFeelings"]
}
"listeningCuesHit" = the subset of the three techniques above this reply demonstrated — empty array if none.`
}

export function parseListeningJudgeResponse(text: string): { doctorText: string; listeningCuesHit: ListeningCue[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const listeningCuesHit: ListeningCue[] = Array.isArray(o.listeningCuesHit) ? o.listeningCuesHit.filter(isListeningCue) : []
  return { doctorText: o.doctorText, listeningCuesHit }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- voice-partner-questioning`
Expected: PASS (all tests in `voice-partner-questioning.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-partner-questioning.ts src/lib/voice-partner-questioning.test.ts
git commit -m "$(cat <<'EOF'
feat: add question-classification and active-listening judge prompts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 3: Migration `016_voice_partner_question_sessions.sql`

**Files:**
- Create: `supabase/migrations/016_voice_partner_question_sessions.sql`

**Interfaces:**
- Produces: table `public.voice_partner_question_sessions` (columns: `id`, `rep_id`, `doctor_id`, `style`, `question_type text`, `listening_cues_hit text[]`, `created_at`), consumed by Task 7's API route.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/016_voice_partner_question_sessions.sql`:

```sql
-- Voice-partner question-drill results: one row per completed 2-turn
-- session (ask a question, then respond to the doctor's answer). Unlike
-- voice_partner_sessions there is no outcome/turn_count — the session is
-- always exactly two fixed turns. Rows are self-reported by the client
-- (no server-side session state to validate against) — a future
-- manager-facing view must treat them as practice self-reports, not
-- audited results.
create table public.voice_partner_question_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  question_type text not null check (question_type = any (
    array['forbidden_reason','forbidden_indication','effective_challenges','effective_criteria','other']
  )),
  listening_cues_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.voice_partner_question_sessions enable row level security;

create policy "own voice partner question sessions read" on public.voice_partner_question_sessions for select using (rep_id = auth.uid());

create policy "own voice partner question sessions insert" on public.voice_partner_question_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner question sessions read" on public.voice_partner_question_sessions for select using (
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
git add supabase/migrations/016_voice_partner_question_sessions.sql
git commit -m "$(cat <<'EOF'
feat: add voice_partner_question_sessions table with RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

(No local apply/test step — matches this project's migration convention.)

---

### Task 4: i18n keys (EN + AR)

**Files:**
- Modify: `src/lib/i18n.tsx` (two places — the EN dictionary, currently ending its `voiceOpening.*`/`visit.*` block at line 349, and the AR dictionary, currently ending its equivalent block at line 748)

**Interfaces:**
- Produces: translation keys consumed by Task 9 (`QuestionDrill.tsx`) and Task 10 (`VisitPrep.tsx`).

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`, immediately after the line `'visit.voicePartnerOpeningNote': 'AI voice partner · opening statement · {hit}/{total} criteria met',` (line 349), add:

```ts
  'voiceQuestion.entryButton': '❓ Practice Questioning',
  'voiceQuestion.teaser': "This premium feature lets you rehearse the questions you ask {name} after your opening — then practice listening to their answer.",
  'voiceQuestion.subtitleAsk': 'Ask your question',
  'voiceQuestion.subtitleRespond': 'Respond to the doctor',
  'voiceQuestion.done': 'Question drill complete',
  'voiceQuestion.rateLimited': "You've hit the practice limit for this hour — try again later.",
  'voiceQuestion.type.forbidden_reason': 'Forbidden — asked why they prescribe',
  'voiceQuestion.type.forbidden_reason.desc': 'Makes the doctor rehearse and reinforce their own existing reasons.',
  'voiceQuestion.type.forbidden_indication': "Forbidden — asked what they'd prescribe",
  'voiceQuestion.type.forbidden_indication.desc': 'Puts the doctor on the spot; invites a vague or defensive answer.',
  'voiceQuestion.type.effective_challenges': 'Effective — asked about patient challenges',
  'voiceQuestion.type.effective_challenges.desc': "Surfaces the patient needs behind the doctor's decisions.",
  'voiceQuestion.type.effective_criteria': 'Effective — asked about selection criteria',
  'voiceQuestion.type.effective_criteria.desc': 'Surfaces what the doctor actually weighs when choosing.',
  'voiceQuestion.type.other': 'Missed opportunity',
  'voiceQuestion.type.other.desc': "Didn't open up the conversation the way a targeted question would.",
  'voiceQuestion.cue.restated': 'Restated — repeated back or echoed their words',
  'voiceQuestion.cue.paraphrased': 'Paraphrased — reflected the meaning in your own words',
  'voiceQuestion.cue.validatedFeelings': 'Validated feelings — acknowledged how they feel about it',
  'visit.sourceVoicePartnerQuestion': 'AI voice partner · questioning drill',
  'visit.voicePartnerQuestionNote': 'AI voice partner · questioning drill · {type} · {hit}/{total} listening cues',
```

- [ ] **Step 2: Add the AR keys**

In `src/lib/i18n.tsx`, immediately after the line `'visit.voicePartnerOpeningNote': 'شريك صوتي بالذكاء · جملة الافتتاح · {hit}/{total} معايير محققة',` (line 748), add:

```ts
  'voiceQuestion.entryButton': '❓ تدرّب على الأسئلة',
  'voiceQuestion.teaser': 'تتيح لك هذه الميزة المميّزة التدرّب على الأسئلة التي تطرحها على {name} بعد جملة الافتتاح — ثم التدرّب على الإصغاء لإجابته.',
  'voiceQuestion.subtitleAsk': 'اطرح سؤالك',
  'voiceQuestion.subtitleRespond': 'ردّ على الطبيب',
  'voiceQuestion.done': 'اكتمل تدريب الأسئلة',
  'voiceQuestion.rateLimited': 'لقد وصلت إلى حد التدريب لهذه الساعة — حاول مرة أخرى لاحقاً.',
  'voiceQuestion.type.forbidden_reason': 'ممنوع — سألت لماذا يصف الدواء',
  'voiceQuestion.type.forbidden_reason.desc': 'يجعل الطبيب يكرر ويعزز أسبابه الحالية دون جديد.',
  'voiceQuestion.type.forbidden_indication': 'ممنوع — سألت ماذا سيصف',
  'voiceQuestion.type.forbidden_indication.desc': 'يضع الطبيب في موقف حرج، ويدعو لإجابة مبهمة أو دفاعية.',
  'voiceQuestion.type.effective_challenges': 'فعّال — سألت عن تحديات المرضى',
  'voiceQuestion.type.effective_challenges.desc': 'يُظهر احتياجات المريض وراء قرارات الطبيب.',
  'voiceQuestion.type.effective_criteria': 'فعّال — سألت عن معايير الاختيار',
  'voiceQuestion.type.effective_criteria.desc': 'يُظهر ما يزنه الطبيب فعلياً عند الاختيار.',
  'voiceQuestion.type.other': 'فرصة ضائعة',
  'voiceQuestion.type.other.desc': 'لم يفتح المحادثة كما يفعل سؤال موجّه.',
  'voiceQuestion.cue.restated': 'أعاد الصياغة — كرر أو ردد كلماته',
  'voiceQuestion.cue.paraphrased': 'أعاد التعبير — عكس المعنى بكلماتك',
  'voiceQuestion.cue.validatedFeelings': 'تحقق من المشاعر — أقرّ بشعوره تجاه الأمر',
  'visit.sourceVoicePartnerQuestion': 'شريك صوتي بالذكاء · تدريب الأسئلة',
  'visit.voicePartnerQuestionNote': 'شريك صوتي بالذكاء · تدريب الأسئلة · {type} · {hit}/{total} إشارات إصغاء',
```

Use the Edit tool for both insertions — do not regenerate the whole file via a shell command (this file has real Arabic text and a full-file re-save can silently corrupt the encoding in this environment; targeted Edit-tool changes only).

- [ ] **Step 3: Verify both dictionaries define the same key set**

Run: `grep -oE "^\s*'voiceQuestion\.[a-zA-Z_.]+'|^\s*'visit\.(sourceVoicePartnerQuestion|voicePartnerQuestionNote)'" src/lib/i18n.tsx | sort | uniq -c`

Expected: every key listed exactly twice (once per language block).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "$(cat <<'EOF'
feat: add EN+AR translations for question drill mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 5: API route `POST /api/voice-partner/question-drill/ask` (turn 1)

**Files:**
- Create: `src/app/api/voice-partner/question-drill/ask/route.ts`

**Interfaces:**
- Consumes: `SYSTEM`, `transcribeAudio` from `@/lib/voice-partner-core`; `buildQuestionJudgePrompt`, `parseQuestionJudgeResponse` from `@/lib/voice-partner-questioning` (Task 2); `buildHistoryContext` from `@/lib/doctor-context`; `checkRateLimit` from `@/lib/rate-limit`; `createClient` from `@/lib/supabase-server`
- Produces: `POST` handler returning `{ questionText, doctorText, questionType }` on success, consumed by Task 8's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/question-drill/ask/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, transcribeAudio } from '@/lib/voice-partner-core'
import { buildQuestionJudgePrompt, parseQuestionJudgeResponse } from '@/lib/voice-partner-questioning'
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

  // Shared bucket with the rest of voice partner (see open/route.ts).
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

  const questionText = await transcribeAudio(audio, openaiKey, lang)
  if (!questionText) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const prompt = buildQuestionJudgePrompt(doctor as Doctor, style, lang, historyContext, questionText)

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
  const judged = parseQuestionJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ questionText, doctorText: judged.doctorText, questionType: judged.questionType })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/question-drill/ask/route.ts
git commit -m "$(cat <<'EOF'
feat: add question-drill ask route (turn 1)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 6: API route `POST /api/voice-partner/question-drill/respond` (turn 2)

**Files:**
- Create: `src/app/api/voice-partner/question-drill/respond/route.ts`

**Interfaces:**
- Consumes: `SYSTEM`, `transcribeAudio` from `@/lib/voice-partner-core`; `buildListeningJudgePrompt`, `parseListeningJudgeResponse`, `isQuestionType` from `@/lib/voice-partner-questioning` (Task 2); `buildHistoryContext`, `checkRateLimit`, `createClient` as in Task 5.
- Produces: `POST` handler returning `{ repResponseText, doctorText, listeningCuesHit }` on success, consumed by Task 8's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/question-drill/respond/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, transcribeAudio } from '@/lib/voice-partner-core'
import { buildListeningJudgePrompt, parseListeningJudgeResponse, isQuestionType } from '@/lib/voice-partner-questioning'
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

  // Shared bucket with the rest of voice partner.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const doctorId = form.get('doctorId')
  const lang = form.get('lang') === 'ar' ? 'ar' : 'en'
  const audio = form.get('audio')
  const questionText = form.get('questionText')
  const doctorAnswer = form.get('doctorAnswer')
  const questionTypeRaw = form.get('questionType')
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof questionText !== 'string' || !questionText.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof doctorAnswer !== 'string' || !doctorAnswer.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof questionTypeRaw !== 'string' || !isQuestionType(questionTypeRaw)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  const repResponseText = await transcribeAudio(audio, openaiKey, lang)
  if (!repResponseText) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const prompt = buildListeningJudgePrompt(doctor as Doctor, style, lang, historyContext, questionText, doctorAnswer, questionTypeRaw, repResponseText)

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
  const judged = parseListeningJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ repResponseText, doctorText: judged.doctorText, listeningCuesHit: judged.listeningCuesHit })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/question-drill/respond/route.ts
git commit -m "$(cat <<'EOF'
feat: add question-drill respond route (turn 2)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 7: API route `POST /api/voice-partner/question-drill/session-result`

**Files:**
- Create: `src/app/api/voice-partner/question-drill/session-result/route.ts`

**Interfaces:**
- Consumes: `isQuestionType`, `isListeningCue`, `type ListeningCue` from `@/lib/voice-partner-questioning` (Task 2); the `voice_partner_question_sessions` table (Task 3)
- Produces: `POST` handler inserting one session-result row, consumed by Task 8's hook.

- [ ] **Step 1: Write the route**

Create `src/app/api/voice-partner/question-drill/session-result/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isQuestionType, isListeningCue, type ListeningCue } from '@/lib/voice-partner-questioning'
import type { Doctor } from '@/types/game'

// Stricter than voice-partner-questioning's AI-judge-output parsing: this
// route rejects the whole request if ANY element is invalid, rather than
// silently filtering out the bad ones.
function parseListeningCuesHit(raw: unknown): ListeningCue[] | null {
  if (!Array.isArray(raw)) return null
  return raw.every(isListeningCue) ? (raw as ListeningCue[]) : null
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
  // to that budget.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as {
    doctorId?: string; questionType?: string; listeningCuesHit?: unknown
  } | null
  if (!body?.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isQuestionType(body.questionType)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const listeningCuesHit = parseListeningCuesHit(body.listeningCuesHit)
  if (!listeningCuesHit) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor; look style up
  // server-side rather than trusting a client-supplied value.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('voice_partner_question_sessions').insert({
    rep_id: user.id,
    doctor_id: body.doctorId,
    style: (doctor as Doctor).style,
    question_type: body.questionType,
    listening_cues_hit: listeningCuesHit,
  })
  if (error) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voice-partner/question-drill/session-result/route.ts
git commit -m "$(cat <<'EOF'
feat: add question-drill session-result endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 8: `useQuestionDrill` hook

**Files:**
- Create: `src/hooks/useQuestionDrill.ts`

**Interfaces:**
- Consumes: `QuestionType`, `ListeningCue`, `isQuestionType`, `isListeningCue` from `@/lib/voice-partner-questioning` (Task 2); the three routes from Tasks 5-7; the existing `POST /api/voice-partner/speak` route (unchanged)
- Produces: `useQuestionDrill(doctorId: string, lang: 'en' | 'ar')` returning `{ phase, turn1, result, startRecording, stopRecording, reset }` where `phase: 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'`, `turn1: { questionText: string; doctorAnswer: string; questionType: QuestionType } | null`, `result: { doctorText: string; listeningCuesHit: ListeningCue[] } | null` — consumed by Task 9's component.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useQuestionDrill.ts`:

```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { QuestionType, ListeningCue } from '@/lib/voice-partner-questioning'
import { isQuestionType, isListeningCue } from '@/lib/voice-partner-questioning'

export type QuestionDrillPhase =
  | 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type QuestionDrillTurn1 = { questionText: string; doctorAnswer: string; questionType: QuestionType }
export type QuestionDrillResult = { doctorText: string; listeningCuesHit: ListeningCue[] }

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

export function useQuestionDrill(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<QuestionDrillPhase>('idle')
  const [turn1, setTurn1] = useState<QuestionDrillTurn1 | null>(null)
  const [result, setResult] = useState<QuestionDrillResult | null>(null)

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

  const saveSessionResult = useCallback(async (questionType: QuestionType, listeningCuesHit: ListeningCue[]) => {
    try {
      const res = await fetch('/api/voice-partner/question-drill/session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, questionType, listeningCuesHit }),
      })
      // Best-effort — the rep still sees their result either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('question drill session-result save failed:', res.status)
    } catch (err) {
      console.warn('question drill session-result save failed:', err)
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
      if (!turn1) {
        // Turn 1: the rep is asking the question.
        const form = new FormData()
        form.append('doctorId', doctorId)
        form.append('lang', lang)
        form.append('audio', blob, 'question.webm')

        const res = await fetch('/api/voice-partner/question-drill/ask', { method: 'POST', body: form })
        if (res.status === 503) { setPhase('notconfigured'); return }
        if (res.status === 429) { setPhase('ratelimited'); return }
        if (!res.ok) { setPhase('error'); return }
        const data = await res.json().catch(() => null) as {
          questionText?: string; doctorText?: string; questionType?: unknown
        } | null
        if (!data?.questionText || !data.doctorText || !isQuestionType(data.questionType)) { setPhase('error'); return }

        setTurn1({ questionText: data.questionText, doctorAnswer: data.doctorText, questionType: data.questionType })

        const audio = await speak(data.doctorText, lang)
        setPhase('playing')
        if (audio) await playBase64Audio(audio)
        setPhase('idle')
      } else {
        // Turn 2: the rep is responding to the doctor's answer.
        const form = new FormData()
        form.append('doctorId', doctorId)
        form.append('lang', lang)
        form.append('audio', blob, 'response.webm')
        form.append('questionText', turn1.questionText)
        form.append('doctorAnswer', turn1.doctorAnswer)
        form.append('questionType', turn1.questionType)

        const res = await fetch('/api/voice-partner/question-drill/respond', { method: 'POST', body: form })
        if (res.status === 503) { setPhase('notconfigured'); return }
        if (res.status === 429) { setPhase('ratelimited'); return }
        if (!res.ok) { setPhase('error'); return }
        const data = await res.json().catch(() => null) as {
          repResponseText?: string; doctorText?: string; listeningCuesHit?: unknown
        } | null
        if (!data?.doctorText) { setPhase('error'); return }

        const listeningCuesHit = Array.isArray(data.listeningCuesHit) ? data.listeningCuesHit.filter(isListeningCue) : []
        setResult({ doctorText: data.doctorText, listeningCuesHit })
        void saveSessionResult(turn1.questionType, listeningCuesHit)

        const audio = await speak(data.doctorText, lang)
        setPhase('playing')
        if (audio) await playBase64Audio(audio)
        setPhase('idle')
      }
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang, turn1, saveSessionResult])

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
    setTurn1(null)
    setResult(null)
  }, [])

  return { phase, turn1, result, startRecording, stopRecording, reset }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useQuestionDrill.ts
git commit -m "$(cat <<'EOF'
feat: add useQuestionDrill hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 9: `QuestionDrill.tsx` component

**Files:**
- Create: `src/components/game/QuestionDrill.tsx`

**Interfaces:**
- Consumes: `useQuestionDrill` (Task 8); `LISTENING_CUES`, `type QuestionType`, `type ListeningCue` from `@/lib/voice-partner-questioning` (Task 2); `Feedback`, `escapeHtml` from `./helpers` (Task 1); i18n keys `voiceQuestion.*` and reused `voice.*` keys (Task 4 + existing)
- Produces: `export default function QuestionDrill({ doctor, onDone }: { doctor: Doctor; onDone: (meta: { completed: boolean; questionType: QuestionType | null; listeningCuesHit: ListeningCue[] }) => void })`, consumed by Task 10's `VisitPrep.tsx` wrapper.

- [ ] **Step 1: Write the component**

Create `src/components/game/QuestionDrill.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useQuestionDrill } from '@/hooks/useQuestionDrill'
import { LISTENING_CUES, type QuestionType, type ListeningCue } from '@/lib/voice-partner-questioning'
import { Feedback, escapeHtml } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (meta: { completed: boolean; questionType: QuestionType | null; listeningCuesHit: ListeningCue[] }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }
const TYPE_COLOR: Record<QuestionType, string> = {
  forbidden_reason: 'var(--red)', forbidden_indication: 'var(--red)',
  effective_challenges: 'var(--green)', effective_criteria: 'var(--green)',
  other: 'var(--amber)',
}

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function QuestionDrill({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, turn1, result, startRecording, stopRecording, reset } = useQuestionDrill(doctor.id, lang)
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
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone({ completed: false, questionType: null, listeningCuesHit: [] })}>
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
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceQuestion.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone({ completed: false, questionType: null, listeningCuesHit: [] })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'ratelimited' ? t('voiceQuestion.rateLimited') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  const subtitle = turn1 ? t('voiceQuestion.subtitleRespond') : t('voiceQuestion.subtitleAsk')

  const listeningHtml = result
    ? `<div>${escapeHtml(result.doctorText)}</div>` +
      `<ul style="margin:8px 0 0;padding-inline-start:18px;list-style:none">` +
      LISTENING_CUES.map(cue => `<li>${result.listeningCuesHit.includes(cue) ? '✓' : '—'} ${escapeHtml(t(`voiceQuestion.cue.${cue}`))}</li>`).join('') +
      `</ul>`
    : ''

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{subtitle}</div>
          </div>
        </div>

        {turn1 && !result && (
          <div style={{ borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5, background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)', marginBottom: 14 }}>
            {turn1.doctorAnswer}
          </div>
        )}

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
              onClick={() => { reset(); onDone({ completed: false, questionType: null, listeningCuesHit: [] }) }}
              style={{ ...ghostBtn, marginTop: 10 }}
            >
              {t('voice.back')}
            </button>
          </>
        )}

        {result && turn1 && (
          <>
            <div style={{ borderRadius: 12, padding: '11px 13px', border: `1px solid ${TYPE_COLOR[turn1.questionType]}`, background: 'rgba(0,0,0,.2)', marginBottom: 10 }}>
              <b style={{ display: 'block', fontFamily: 'var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 11, marginBottom: 5, color: TYPE_COLOR[turn1.questionType] }}>{t(`voiceQuestion.type.${turn1.questionType}`)}</b>
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t(`voiceQuestion.type.${turn1.questionType}.desc`)}</span>
            </div>
            <Feedback ok={result.listeningCuesHit.length >= 2} title={t('voiceQuestion.done')} body={listeningHtml} />
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => onDone({ completed: true, questionType: turn1.questionType, listeningCuesHit: result.listeningCuesHit })}
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

Note: the question-type verdict block deliberately does NOT go through `escapeHtml`/`dangerouslySetInnerHTML` — it's rendered as plain JSX children (`{t(...)}`), which React escapes automatically. Only `listeningHtml` (built as an HTML string for `Feedback`'s `body` prop) needs the manual `escapeHtml` calls, exactly like Opening Statement mode's `checklistHtml`.

- [ ] **Step 2: Commit**

```bash
git add src/components/game/QuestionDrill.tsx
git commit -m "$(cat <<'EOF'
feat: add QuestionDrill component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 10: Wire into `VisitPrep.tsx` (view mode, entry button, doctor-visit logging)

**Files:**
- Modify: `src/types/game.ts:97` (extend `DoctorVisit['source']` union)
- Modify: `src/components/game/VisitPrep.tsx` (import component + `LISTENING_CUES`, add `View` variant, add render branch, add entry button, add wrapper, extend `SOURCE_LABEL_KEY`)

**Interfaces:**
- Consumes: `QuestionDrill` (Task 9), `LISTENING_CUES` from `@/lib/voice-partner-questioning` (Task 2), i18n keys from Task 4.
- Produces: entry point reachable from the doctor detail screen; a `voice_partner_question` sourced row in `doctor_visits` on completion.

- [ ] **Step 1: Extend the `DoctorVisit` source union**

In `src/types/game.ts`, change line 97 from:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening'
```

to:

```ts
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question'
```

- [ ] **Step 2: Import the new component and add the `View` variant**

In `src/components/game/VisitPrep.tsx`, add the import after line 16 (`import VoicePartnerOpening from './VoicePartnerOpening'`):

```tsx
import QuestionDrill from './QuestionDrill'
import { LISTENING_CUES } from '@/lib/voice-partner-questioning'
```

Add a new variant to the `View` union (after `| { mode: 'voiceOpening'; doctor: Doctor }`):

```ts
  | { mode: 'questionDrill'; doctor: Doctor }
```

- [ ] **Step 3: Add the render branch**

Immediately after the existing opening-statement render branch (after the closing `}` of `if (view.mode === 'voiceOpening') { ... }`, currently ending at line 97), add:

```tsx
  // ───────────────────────── AI VOICE PARTNER: QUESTION DRILL ─────────────────────────
  if (view.mode === 'questionDrill') {
    return <QuestionDrillScreen doctor={view.doctor} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 4: Add the entry button**

In the cheat-panel button list, immediately after the existing opening-statement button (after its closing `</button>`, currently ending at line 164), add:

```tsx
            <button onClick={() => setView({ mode: 'questionDrill', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('voiceQuestion.entryButton')} · {t('voice.premium')}
            </button>
```

- [ ] **Step 5: Add the wrapper component**

Immediately after the existing `VoicePartnerOpeningScreen` wrapper function (after its closing `}`, currently at line 511), add:

```tsx
// ───────────────────────── AI voice partner question-drill wrapper (owns doctor_visits logging) ─────────────────────────
function QuestionDrillScreen({ doctor, onDone }: { doctor: Doctor; onDone: () => void }) {
  const t = useT()
  const { addVisit } = useDoctorVisits(doctor.id)

  return (
    <QuestionDrill
      doctor={doctor}
      onDone={(meta) => {
        if (meta.completed && meta.questionType) {
          void addVisit({
            source: 'voice_partner_question',
            note: t('visit.voicePartnerQuestionNote', {
              type: t(`voiceQuestion.type.${meta.questionType}`),
              hit: meta.listeningCuesHit.length,
              total: LISTENING_CUES.length,
            }),
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
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening',
}
```

to:

```ts
const SOURCE_LABEL_KEY: Record<DoctorVisit['source'], string> = {
  manual: 'visit.sourceManual', warmup: 'visit.sourceWarmup', ai_drill: 'visit.sourceAiDrill', voice_partner: 'visit.sourceVoicePartner', voice_partner_opening: 'visit.sourceVoicePartnerOpening', voice_partner_question: 'visit.sourceVoicePartnerQuestion',
}
```

- [ ] **Step 7: Commit**

```bash
git add src/types/game.ts src/components/game/VisitPrep.tsx
git commit -m "$(cat <<'EOF'
feat: wire question drill mode into VisitPrep doctor detail screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUGHhXh67HFSXh4q4HQDY1
EOF
)"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: PASS — every existing test plus the new `voice-partner-questioning.test.ts` tests from Task 2.

- [ ] **Step 2: Run a full production build to type-check the whole app**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. This is this project's only type-checking gate — it is the step that would catch a mismatched import, a missing export, or a `View`/`SOURCE_LABEL_KEY` union that isn't exhaustive.

- [ ] **Step 3: If either step fails, fix and re-run before considering the plan complete**

No commit for this task — it's a gate, not a deliverable.

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-09-07-question-drill-mode-design.md` maps to a task — Data model → Task 2-3, API changes → Tasks 5-7, UI changes → Tasks 8-10, Error handling → inline in Tasks 5/6/7 (matching the spec's route-level error contract, including the deliberate strict-vs-lenient `questionType`/`listeningCuesHit` asymmetry called out explicitly in Global Constraints), Testing → Task 2's test file + Task 11's full-suite gate.
- **Placeholder scan:** no TBDs; every step has literal code.
- **Type consistency:** `QuestionType`/`QUESTION_TYPES`/`isQuestionType` and `ListeningCue`/`LISTENING_CUES`/`isListeningCue` (Task 2) are the same identifiers used verbatim across Tasks 5-10. `{ completed: boolean; questionType: QuestionType | null; listeningCuesHit: ListeningCue[] }` is the one `onDone` meta shape used by both Task 9 (producer) and Task 10 (consumer) — `questionType` is nullable in the meta shape specifically to cover the early-exit paths (consent cancel, notconfigured back, mid-drill back), which happen before `turn1` exists.
