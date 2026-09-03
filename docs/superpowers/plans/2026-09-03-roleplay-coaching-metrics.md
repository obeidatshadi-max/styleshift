# Roleplay Coaching Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the roleplay-verbal-mirror feature with three new coaching dimensions — open-ended vs. closed questions, paraphrase/rephrase detection, and an active-listening composite score — computed from the same diarized roleplay transcript already captured, never persisting the practice partner's actual words.

**Architecture:** Three new pure, unit-tested functions in `roleplay-core.ts` (`classifyQuestions`, `computeParaphraseScore`, `computeActiveListeningScore`), wired into `buildRoleplayResult`. `paraphraseScore` compares each rep turn's content words against the *immediately preceding partner turn* using transient in-memory text — consistent with the existing constraint that partner speech is used only in-memory, never persisted; only the resulting numbers are stored. New DB columns on `roleplay_sessions`, new insert fields in `useRoleplayRecorder`, new result-screen UI in `RoleplayRecorder`, new bilingual copy.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres + RLS), React — same stack as the existing roleplay feature.

**Spec:** No standalone spec doc — this plan implements the three coaching-metric examples (active listening, open-ended questions, paraphrase/rephrase) agreed in conversation on 2026-09-03, scoped to the Rehearse pillar (colleague roleplay) specifically because scoring them honestly requires comparing rep speech against partner speech content — which the Perform pillar (live real doctor visit) is constrained never to capture.

## Global Constraints

- **Never persist the practice partner's actual spoken words.** `computeParaphraseScore` reads partner-turn text from the same in-memory `Utterance[]`/`Turn[]` the existing pipeline already discards after scoring (see `useRoleplayRecorder.ts`'s `pickSpeaker`) — it must not add any new field, log, or DB column that stores partner text or a partner-derived transcript, only the derived number.
- Bilingual EN/AR throughout, following the existing flat-key `t()` dictionary pattern in `src/lib/i18n.tsx`.
- Follow existing inline-style convention (CSS custom properties like `var(--cyan)`, `var(--panel)`, `var(--line)`) — no Tailwind, no new CSS files.
- New pure logic lives in `roleplay-core.ts` (the existing `X-core.ts` pattern), Vitest-tested, no React/DOM dependency.
- RLS/migration pattern mirrors `009_roleplay_sessions.sql` / `010_roleplay_sessions_doctor_scope.sql` exactly — additive `alter table`, no policy changes needed (existing "own roleplay sessions insert/read" + "manager roleplay sessions read" policies already cover new columns on the same table).

---

## Task 1: Open vs. closed question breakdown

**Files:**
- Modify: `src/lib/roleplay-core.ts`
- Test: `src/lib/roleplay-core.test.ts`

**Interfaces:**
- Consumes: `Turn` (existing), `QUESTION_STARTERS_AR` (existing, unchanged)
- Produces: `QuestionBreakdown` interface, `classifyQuestions(turns: Turn[], repSpeaker: string): QuestionBreakdown` — later tasks (Task 3) import this exact name.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('turn-taking analysis', ...)` block in `src/lib/roleplay-core.test.ts` (it already has the `utterances` fixture in scope — reuse it, don't redeclare):

```typescript
  it('splits rep questions into open vs. closed', () => {
    const turns = buildTurns(utterances)
    // rep (A) turns: none are questions
    expect(classifyQuestions(turns, 'A')).toEqual({ total: 0, open: 0, closed: 0, openRatio: 0 })
    // partner (B): "Sure, what have you got?" -> contains "what" -> open
    //              "Does it interact with anticoagulants?" -> contains "does", no open marker -> closed
    const b = classifyQuestions(turns, 'B')
    expect(b.total).toBe(2)
    expect(b.open).toBe(1)
    expect(b.closed).toBe(1)
    expect(b.openRatio).toBeCloseTo(0.5, 5)
  })
```

Update the import line at the top of the file to add `classifyQuestions`:

```typescript
import {
  processAcousticData, classifySocialStyle, buildTurns, computeTalkRatio,
  computeRapidTurnSwitches, computeQuestionRatio, classifyQuestions, repTranscript,
  scopeAcousticToSpeaker, buildRoleplayResult,
  type Utterance, type PitchSample, type SilencePeriod,
} from './roleplay-core'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL — `classifyQuestions` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/roleplay-core.ts`, immediately after the existing `computeQuestionRatio` function (after its closing brace, before `export function repTranscript`), add:

```typescript
// "Contains" rather than "starts with" — a wh-word or yes/no marker rarely
// opens the sentence exactly ("Sure, what have you got?"), so anchoring to
// the start would miss it.
const OPEN_MARKERS_EN = /\b(what|how|why|when|where|which|tell me|walk me through|describe|explain)\b/i
const OPEN_MARKERS_AR = /\b(ماذا|كيف|متى|لماذا|أين|من|كم)\b/

export interface QuestionBreakdown { total: number; open: number; closed: number; openRatio: number }

/**
 * Splits a speaker's questions into open-ended (wh-word / "tell me" / "walk
 * me through" style — invites the other person to elaborate) vs. closed
 * (yes/no-shaped, or a question with no open marker). A question with no
 * detected open marker defaults to closed rather than "undetermined" — most
 * unmarked questions ("This works for you?") are yes/no-shaped in practice.
 */
export function classifyQuestions(turns: Turn[], repSpeaker: string): QuestionBreakdown {
  const repTurns = turns.filter(t => t.speaker === repSpeaker)
  const isQuestion = (text: string) => {
    const trimmed = text.trim()
    return trimmed.endsWith('?') || trimmed.endsWith('؟') || QUESTION_STARTERS_AR.test(trimmed)
  }
  const questions = repTurns.map(t => t.text).filter(isQuestion)
  const open = questions.filter(q => OPEN_MARKERS_EN.test(q) || OPEN_MARKERS_AR.test(q)).length
  const total = questions.length
  return { total, open, closed: total - open, openRatio: total > 0 ? open / total : 0 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/roleplay-core.ts src/lib/roleplay-core.test.ts
git commit -m "feat: add open vs closed question breakdown to roleplay-core"
```

---

## Task 2: Paraphrase/rephrase score

**Files:**
- Modify: `src/lib/roleplay-core.ts`
- Test: `src/lib/roleplay-core.test.ts`

**Interfaces:**
- Consumes: `Turn` (existing)
- Produces: `computeParaphraseScore(turns: Turn[], repSpeaker: string): number` (0–1) — Task 3 imports this exact name.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `src/lib/roleplay-core.test.ts` (after the existing `describe('turn-taking analysis', ...)` block, same file):

```typescript
describe('paraphrase score', () => {
  it('scores how much of the partner\'s content words the rep echoes back in the next turn', () => {
    const utterances: Utterance[] = [
      { speaker: 'B', text: 'The main worry is dosing frequency and patient compliance.', start: 0, end: 3000 },
      { speaker: 'A', text: 'So dosing frequency and compliance are your main worry, got it.', start: 3100, end: 6000 },
      { speaker: 'B', text: 'Also cost is a factor for our patients.', start: 6100, end: 8000 },
      { speaker: 'A', text: 'Understood, thanks for sharing that.', start: 8100, end: 10000 },
    ]
    const turns = buildTurns(utterances)
    // pair 1: rep echoes 5 of partner's 6 content words -> 5/6
    // pair 2: rep echoes 0 of partner's 5 content words -> 0/5
    // average: (5/6 + 0) / 2
    expect(computeParaphraseScore(turns, 'A')).toBeCloseTo((5 / 6 + 0) / 2, 3)
  })

  it('returns 0 when no rep turn follows a partner turn', () => {
    const turns = buildTurns([{ speaker: 'A', text: 'hello there', start: 0, end: 500 }])
    expect(computeParaphraseScore(turns, 'A')).toBe(0)
  })
})
```

Update the import line to add `computeParaphraseScore`:

```typescript
import {
  processAcousticData, classifySocialStyle, buildTurns, computeTalkRatio,
  computeRapidTurnSwitches, computeQuestionRatio, classifyQuestions, computeParaphraseScore, repTranscript,
  scopeAcousticToSpeaker, buildRoleplayResult,
  type Utterance, type PitchSample, type SilencePeriod,
} from './roleplay-core'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL — `computeParaphraseScore` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/roleplay-core.ts`, immediately after the `classifyQuestions` function added in Task 1 (before `export function repTranscript`), add:

```typescript
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but', 'not', 'this', 'that', 'with', 'as', 'at',
  'be', 'do', 'does', 'did', 'have', 'has',
  'من', 'في', 'على', 'إلى', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'و', 'أو', 'لا', 'نعم', 'كان', 'كانت',
])

/** Lowercased, punctuation-stripped content words (length > 2, stopwords removed). */
function contentWords(text: string): Set<string> {
  const words = (text || '').toLowerCase().replace(/[.,!?؟،;:"'()]/g, '').split(/\s+/).filter(Boolean)
  return new Set(words.filter(w => w.length > 2 && !STOPWORDS.has(w)))
}

/**
 * For each rep turn that immediately follows a partner turn, scores what
 * fraction of the partner's content words the rep's reply echoes back — a
 * proxy for paraphrasing/rephrasing what was just said. Reads partner-turn
 * TEXT transiently (same in-memory Utterance[] the pipeline already
 * discards after scoring) — only the resulting number is ever persisted.
 * Returns the average across all measured rep-follows-partner pairs, or 0
 * if there are none.
 */
export function computeParaphraseScore(turns: Turn[], repSpeaker: string): number {
  let scored = 0, pairs = 0
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].speaker !== repSpeaker || turns[i - 1].speaker === repSpeaker) continue
    const partnerWords = contentWords(turns[i - 1].text)
    if (partnerWords.size === 0) continue
    const repWords = contentWords(turns[i].text)
    let hits = 0
    for (const w of partnerWords) if (repWords.has(w)) hits++
    scored += hits / partnerWords.size
    pairs++
  }
  return pairs > 0 ? scored / pairs : 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/roleplay-core.ts src/lib/roleplay-core.test.ts
git commit -m "feat: add paraphrase score to roleplay-core"
```

---

## Task 3: Active-listening composite + wire into RoleplayResult

**Files:**
- Modify: `src/lib/roleplay-core.ts`
- Test: `src/lib/roleplay-core.test.ts`

**Interfaces:**
- Consumes: `TalkRatio` (existing), `classifyQuestions` (Task 1), `computeParaphraseScore` (Task 2), module-local `clamp01`/`band` helpers (existing, already defined near the top of the file — no import needed, same file)
- Produces: `ActiveListeningResult` interface, `computeActiveListeningScore(talkRatio: TalkRatio, rapidTurnSwitches: number, paraphraseScore: number): ActiveListeningResult`. Extends `RoleplayResult` with `openQuestionRatio: number`, `paraphraseScore: number`, `activeListening: ActiveListeningResult` — Task 5 (`useRoleplayRecorder.ts`) and Task 7 (`RoleplayRecorder.tsx`) read these exact field names off `RoleplayResult`.

- [ ] **Step 1: Write the failing test**

Add another `describe` block to `src/lib/roleplay-core.test.ts`:

```typescript
describe('active listening score', () => {
  it('scores a balanced, non-interrupting, paraphrasing rep as excellent', () => {
    const talkRatio = { repMs: 4000, partnerMs: 6000, totalMs: 10000, repRatio: 0.4 }
    const result = computeActiveListeningScore(talkRatio, 0, 0.8)
    expect(result.score).toBe(82)
    expect(result.label).toBe('excellent')
  })

  it('scores a dominating, interrupting, non-paraphrasing rep as developing', () => {
    const talkRatio = { repMs: 270000, partnerMs: 30000, totalMs: 300000, repRatio: 0.9 }
    const result = computeActiveListeningScore(talkRatio, 20, 0)
    expect(result.score).toBe(15)
    expect(result.label).toBe('developing')
  })
})
```

Update the import line to add `computeActiveListeningScore`:

```typescript
import {
  processAcousticData, classifySocialStyle, buildTurns, computeTalkRatio,
  computeRapidTurnSwitches, computeQuestionRatio, classifyQuestions, computeParaphraseScore,
  computeActiveListeningScore, repTranscript,
  scopeAcousticToSpeaker, buildRoleplayResult,
  type Utterance, type PitchSample, type SilencePeriod,
} from './roleplay-core'
```

Also extend the existing `'builds a full RoleplayResult from utterances plus acoustic samples'` test (same file, `describe('turn-taking analysis', ...)` block) with the three new fields:

```typescript
  it('builds a full RoleplayResult from utterances plus acoustic samples', () => {
    const pitchSamples: PitchSample[] = Array.from({ length: 10 }, (_, i) => ({ f0: 130, vol: 30, t: i * 300 }))
    const result = buildRoleplayResult(utterances, 'A', pitchSamples, [])
    expect(result.talkRatio.repRatio).toBeGreaterThan(0.5)
    expect(result.rapidTurnSwitches).toBe(3)
    expect(result.questionRatio).toBe(0)
    expect(result.durationSec).toBeCloseTo(14, 0)
    expect(result.openQuestionRatio).toBe(0) // rep (A) asked no questions in this fixture
    expect(result.paraphraseScore).toBeGreaterThanOrEqual(0)
    expect(result.paraphraseScore).toBeLessThanOrEqual(1)
    expect(['developing', 'solid', 'excellent']).toContain(result.activeListening.label)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL — `computeActiveListeningScore` not exported, and `RoleplayResult` missing the new fields.

- [ ] **Step 3: Write the implementation**

In `src/lib/roleplay-core.ts`, immediately after `computeParaphraseScore` (added in Task 2, before `export function repTranscript`), add:

```typescript
export interface ActiveListeningResult { score: number; label: 'developing' | 'solid' | 'excellent' }

/**
 * Composite 0-100 score from three signals, each already computed elsewhere:
 * - talk balance: 50% talk time is neutral; scores fall off both above it
 *   (dominating the conversation = not listening) and below ~15% (too
 *   passive to be actively engaging).
 * - cutoff rate: fewer rapid turn-switches per minute (see
 *   computeRapidTurnSwitches) is better.
 * - paraphrase evidence: the strongest direct signal, weighted highest.
 */
export function computeActiveListeningScore(
  talkRatio: TalkRatio, rapidTurnSwitches: number, paraphraseScore: number
): ActiveListeningResult {
  const talkN = talkRatio.repRatio <= 0.5
    ? band(talkRatio.repRatio, 0.15, 0.5)
    : 100 - band(talkRatio.repRatio, 0.5, 0.85)

  const durationMin = talkRatio.totalMs / 60000
  const switchesPerMin = durationMin > 0 ? rapidTurnSwitches / durationMin : 0
  const cutoffN = 100 - band(switchesPerMin, 0, 10)

  const paraphraseN = clamp01(paraphraseScore * 100)

  const score = Math.round(clamp01(talkN * 0.35 + cutoffN * 0.25 + paraphraseN * 0.4))
  const label: ActiveListeningResult['label'] = score >= 75 ? 'excellent' : score >= 45 ? 'solid' : 'developing'
  return { score, label }
}
```

Then update `RoleplayResult` and `buildRoleplayResult` (existing, near the bottom of the file):

```typescript
export interface RoleplayResult {
  talkRatio: TalkRatio
  rapidTurnSwitches: number
  questionRatio: number
  openQuestionRatio: number
  paraphraseScore: number
  activeListening: ActiveListeningResult
  repRead: SocialStyleRead | null
  durationSec: number
}

/** Builds the complete, storable roleplay result from diarized utterances plus the rep's captured acoustic samples for the whole recording (they get scoped to the rep's turns internally). */
export function buildRoleplayResult(
  utterances: Utterance[], repSpeaker: string,
  pitchSamples: PitchSample[], silencePeriods: SilencePeriod[]
): RoleplayResult {
  const turns = buildTurns(utterances)
  const talkRatio = computeTalkRatio(turns, repSpeaker)
  const rapidTurnSwitches = computeRapidTurnSwitches(turns)
  const questionRatio = computeQuestionRatio(turns, repSpeaker)
  const openQuestionRatio = classifyQuestions(turns, repSpeaker).openRatio
  const paraphraseScore = computeParaphraseScore(turns, repSpeaker)
  const activeListening = computeActiveListeningScore(talkRatio, rapidTurnSwitches, paraphraseScore)
  const transcript = repTranscript(turns, repSpeaker)
  const { pitchSamples: repPitch, silencePeriods: repSilence } = scopeAcousticToSpeaker(pitchSamples, silencePeriods, turns, repSpeaker)
  const repDurationSec = talkRatio.repMs / 1000
  const metrics = processAcousticData({ pitchSamples: repPitch, silencePeriods: repSilence, transcript, durationSec: repDurationSec })
  const delivery = analyzeDelivery({ transcript })
  const repRead = metrics ? classifySocialStyle(metrics, delivery.warmth) : null
  return { talkRatio, rapidTurnSwitches, questionRatio, openQuestionRatio, paraphraseScore, activeListening, repRead, durationSec: talkRatio.totalMs / 1000 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: PASS (all roleplay-core tests, including the pre-existing ones)

- [ ] **Step 5: Verify the whole test suite and typecheck still pass**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: PASS with no errors (this changes a shared type other files consume — confirms nothing downstream broke yet, before Tasks 5/7 update those call sites)

- [ ] **Step 6: Commit**

```bash
git add src/lib/roleplay-core.ts src/lib/roleplay-core.test.ts
git commit -m "feat: add active-listening composite, wire all three metrics into RoleplayResult"
```

---

## Task 4: Database migration

**Files:**
- Create: `supabase/migrations/012_roleplay_coaching_metrics.sql`

**Interfaces:**
- Consumes: existing `roleplay_sessions` table (migration 009) and its RLS policies (unchanged — additive columns need no new policy)
- Produces: three new nullable columns Task 5's insert writes to.

- [ ] **Step 1: Write the migration**

```sql
-- Three new coaching metrics from the roleplay verbal-mirror pipeline —
-- open vs. closed question ratio, paraphrase/rephrase score, and an
-- active-listening composite. Same privacy shape as the existing columns:
-- only the derived numbers, never any transcript text.
alter table public.roleplay_sessions
  add column open_question_ratio numeric check (open_question_ratio between 0 and 1),
  add column paraphrase_score numeric check (paraphrase_score between 0 and 1),
  add column active_listening_score integer check (active_listening_score between 0 and 100);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool: `apply_migration` with `project_id: "cnlloaihrrmattuidpeh"`, `name: "roleplay_coaching_metrics"`, and the SQL above as `query`. Confirm the result reports `success: true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_roleplay_coaching_metrics.sql
git commit -m "feat: add roleplay coaching metric columns"
```

---

## Task 5: Persist the new metrics

**Files:**
- Modify: `src/hooks/useRoleplayRecorder.ts:173-183`

**Interfaces:**
- Consumes: `RoleplayResult.openQuestionRatio`, `RoleplayResult.paraphraseScore`, `RoleplayResult.activeListening.score` (Task 3)
- Produces: nothing new consumed by later tasks — this is a leaf write.

- [ ] **Step 1: Add the three fields to the insert**

In `src/hooks/useRoleplayRecorder.ts`, the `pickSpeaker` callback currently inserts:

```typescript
      const { error: insertError } = await supabase.from('roleplay_sessions').insert({
        rep_id: user.id,
        doctor_id: doctorId,
        duration_sec: Math.round(built.durationSec),
        talk_ratio: built.talkRatio.repRatio,
        rapid_turn_switches: built.rapidTurnSwitches,
        question_ratio: built.questionRatio,
        rep_style: built.repRead?.style ?? null,
        rep_confidence: built.repRead?.confidence ?? null,
        rep_metrics: built.repRead ?? null,
      })
```

Change it to:

```typescript
      const { error: insertError } = await supabase.from('roleplay_sessions').insert({
        rep_id: user.id,
        doctor_id: doctorId,
        duration_sec: Math.round(built.durationSec),
        talk_ratio: built.talkRatio.repRatio,
        rapid_turn_switches: built.rapidTurnSwitches,
        question_ratio: built.questionRatio,
        open_question_ratio: built.openQuestionRatio,
        paraphrase_score: built.paraphraseScore,
        active_listening_score: built.activeListening.score,
        rep_style: built.repRead?.style ?? null,
        rep_confidence: built.repRead?.confidence ?? null,
        rep_metrics: built.repRead ?? null,
      })
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRoleplayRecorder.ts
git commit -m "feat: persist open-question, paraphrase, and active-listening scores"
```

---

## Task 6: Bilingual copy

**Files:**
- Modify: `src/lib/i18n.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `t()` keys Task 7's UI calls by these exact names.

- [ ] **Step 1: Add EN keys**

In `src/lib/i18n.tsx`, immediately after the existing `'roleplay.questionRatio': 'Questions You Asked',` line (around line 325), add:

```typescript
  'roleplay.openQuestionRatio': 'Open-Ended Questions',
  'roleplay.openQuestionHint': 'Of the questions you asked, how many invited the other person to elaborate ("what," "how," "tell me more") instead of a yes/no answer.',
  'roleplay.paraphraseScore': 'Paraphrasing',
  'roleplay.paraphraseHint': 'How much of what your partner just said you reflected back in your own words — a core active-listening signal.',
  'roleplay.activeListeningTitle': 'Active Listening',
  'roleplay.activeListening.developing': 'Developing',
  'roleplay.activeListening.solid': 'Solid',
  'roleplay.activeListening.excellent': 'Excellent',
```

- [ ] **Step 2: Add the matching AR keys**

Immediately after the existing `'roleplay.questionRatio': 'الأسئلة التي طرحتها',` line (around line 630), add:

```typescript
  'roleplay.openQuestionRatio': 'الأسئلة المفتوحة',
  'roleplay.openQuestionHint': 'من بين الأسئلة التي طرحتها، كم منها دعا الطرف الآخر للتوسّع ("ماذا"، "كيف"، "أخبرني المزيد") بدلاً من إجابة نعم/لا.',
  'roleplay.paraphraseScore': 'إعادة الصياغة',
  'roleplay.paraphraseHint': 'مقدار ما أعدت صياغته من كلام شريكك بأسلوبك الخاص — إشارة أساسية للاستماع الفعّال.',
  'roleplay.activeListeningTitle': 'الاستماع الفعّال',
  'roleplay.activeListening.developing': 'قيد التطور',
  'roleplay.activeListening.solid': 'جيد',
  'roleplay.activeListening.excellent': 'ممتاز',
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: add bilingual copy for roleplay coaching metrics"
```

---

## Task 7: Result-screen UI

**Files:**
- Modify: `src/components/game/RoleplayRecorder.tsx`

**Interfaces:**
- Consumes: `RoleplayResult.openQuestionRatio`, `RoleplayResult.paraphraseScore`, `RoleplayResult.activeListening` (Task 3), `t()` keys from Task 6
- Produces: nothing new consumed elsewhere — leaf UI.

- [ ] **Step 1: Add the three new blocks to the result screen**

In `src/components/game/RoleplayRecorder.tsx`, the `// phase === 'done'` block currently computes `talkPct`/`questionPct` and renders the talk-ratio bar, question-ratio bar, rapid-switches card, and style-read card, in that order, before the final `Done` button. Insert the three new blocks between the existing `questionRatio` bar and the `rapidSwitches` card:

```typescript
  // phase === 'done'
  const r = result!
  const talkPct = Math.round(r.talkRatio.repRatio * 100)
  const questionPct = Math.round(r.questionRatio * 100)
  const openQuestionPct = Math.round(r.openQuestionRatio * 100)
  const paraphrasePct = Math.round(r.paraphraseScore * 100)
```

Then, immediately after the existing question-ratio bar block (`</div>` closing `roleplay.questionRatio`'s bar, before the `rapidSwitches` card's opening `<div>`), add:

```typescript
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.openQuestionRatio')}</span><span style={{ fontFamily: 'var(--mono)' }}>{openQuestionPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${openQuestionPct}%`, background: 'var(--purple)' }} />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 5 }}>{t('roleplay.openQuestionHint')}</p>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.paraphraseScore')}</span><span style={{ fontFamily: 'var(--mono)' }}>{paraphrasePct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${paraphrasePct}%`, background: 'var(--amber)' }} />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 5 }}>{t('roleplay.paraphraseHint')}</p>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>{t('roleplay.activeListeningTitle')}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
              {r.activeListening.score} · {t(`roleplay.activeListening.${r.activeListening.label}`)}
            </span>
          </div>
        </div>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test -- --run && npm run build`
Expected: All tests PASS, build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/game/RoleplayRecorder.tsx
git commit -m "feat: show open-question, paraphrase, and active-listening scores on the roleplay result screen"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```
