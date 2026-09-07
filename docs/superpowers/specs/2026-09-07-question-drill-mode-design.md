# Forbidden/Effective Questions Drill for AI Voice Partner

## Source

Manager workshop notes (`notesnotes.docx`, repo root, untracked) — the 3P
selling model's "Tailored Execution" stage, section B, immediately after
section A (the effective introduction statement, already built as
[Opening Statement mode](2026-09-07-opening-statement-mode-design.md)):

> After the effective statement now you ask: what do you think doctor?
>
> Two forbidden questions:
> 1. "Why are you prescribing drug X?" — this makes the doctor rehearse
>    and reinforce their own existing reasons; it teaches them nothing new
>    and reassures a position you may want to shift.
> 2. "In this indication, in these cases, what would you prescribe?" —
>    not your business to ask; the doctor may give a vague answer that
>    confuses you, or if they cooperate and answer, you show them your
>    product is "better" and their decision was "wrong" — not a spirit of
>    partnership, and they may feel manipulated by the question.
>
> Two effective questions:
> 1. "In these patient types, what challenges or problems do they face?"
>    — surfaces the patient's needs and the doctor's own need.
> 2. "In these cases/this indication/this specific patient type, when
>    choosing a medication, what criteria or factors are you looking
>    for?"
>
> There are open questions and closed questions. The skill needed right
> after questioning is **active listening**: verbal ways (restate,
> paraphrase, or repeat the last three words) and validating feelings;
> non-verbal ways (nodding, eye contact, leaning forward, open gestures).

## Scope

In scope: a new, standalone AI voice-partner mode (third mode, alongside
objection/CLEAR and Opening Statement), following the same file-per-mode
convention: own core module, own routes, own table, no shared "mode"
framework (same YAGNI call as Opening Statement's spec — three
independently-shaped modes still don't justify unifying them).

Out of scope: chaining onto Opening Statement mode into one continuous
call simulation (statement → question → listening) — decided during
brainstorming to keep this a standalone drill, matching the existing
precedent. A combined multi-phase call simulation is a possible future
project but is not this one.

Out of scope: non-verbal active-listening cues (nodding, eye contact,
posture) — this app is audio-only (Whisper transcription), so only the
verbal-listening half of the source material is assessable. The judge
prompt should not penalize the rep for something it structurally cannot
observe.

Out of scope: the manager dashboard, same as both prior voice-partner
specs — the table + RLS support a future manager view but wiring it in is
a follow-up.

## Decisions (from brainstorming)

1. **Standalone drill, not chained onto Opening Statement.** Independent
   entry point, independent session, independent table.
2. **Two fixed turns, not a loop.** Turn 1: rep asks a question (nothing
   precedes it — the rep initiates, same reasoning as Opening Statement's
   "no `/open` route" decision). Turn 2: rep responds to the doctor's
   answer, judged for active listening. No `TURN_CAP`, no win/escalate
   verdict — the session always runs exactly these two beats then ends.
3. **Question type is classified from free speech, not pre-assigned.**
   Unlike objection mode (where `pickObjectionType()` chooses server-side
   before the rep speaks), the rep chooses their own question; the AI
   judge classifies which of the four archetypes it most resembles (or a
   fifth "other" bucket if it fits none well — see below). This is the
   whole point of the drill: teaching the rep to *choose* an effective
   question, not reacting to a pre-picked scenario.
4. **Active-listening checklist has 3 items** (the verbal-only subset of
   the source material): `restated` (repeated back / restated what the
   doctor said, including the "last three words" technique), `paraphrased`
   (reflected the meaning back in the rep's own words — distinct from
   verbatim restating), `validatedFeelings` (acknowledged how the doctor
   feels or thinks about it, not just what they said).

## Data model

### `QuestionType` (new, `src/lib/voice-partner-questioning.ts`)

```ts
export type QuestionType = 'forbidden_reason' | 'forbidden_indication' | 'effective_challenges' | 'effective_criteria' | 'other'
export const QUESTION_TYPES: readonly QuestionType[] =
  ['forbidden_reason', 'forbidden_indication', 'effective_challenges', 'effective_criteria', 'other']
export function isQuestionType(value: unknown): value is QuestionType
```

`'other'` covers a question the rep asks that doesn't clearly match any of
the four archetypes (e.g. small talk, a closed yes/no question, an
off-topic question) — the judge must always return one of the five values,
never fail to classify. The judge prompt explains all four named
archetypes plus this catch-all explicitly, so the model isn't forced to
force-fit an ambiguous question into a named bucket.

`forbidden_reason` and `forbidden_indication` are "bad" (the rep should
avoid them); `effective_challenges` and `effective_criteria` are "good";
`other` is neutral-to-bad (a missed opportunity, but not manipulative) —
the UI (see below) renders these three tiers with distinct visual
treatment, not just a binary good/bad.

### `ListeningCue` (new, `src/lib/voice-partner-questioning.ts`)

```ts
export type ListeningCue = 'restated' | 'paraphrased' | 'validatedFeelings'
export const LISTENING_CUES: readonly ListeningCue[] = ['restated', 'paraphrased', 'validatedFeelings']
export function isListeningCue(value: unknown): value is ListeningCue
```

### Turn 1 — question judge prompt

`buildQuestionJudgePrompt(doctor, style, lang, historyContext, questionText)`
— reuses `personaLines`/`SYSTEM` from `voice-partner-core.ts` (same import
pattern Opening Statement's module already established). Describes all
five `QuestionType` values (the four archetypes' *intent*, not verbatim
scripts — the rep won't recite the source material word for word) and
asks for:

```json
{
  "doctorText": "your in-character spoken answer to the rep's question, 1-3 sentences",
  "questionType": "forbidden_reason" | "forbidden_indication" | "effective_challenges" | "effective_criteria" | "other"
}
```

The prompt instructs the doctor's answer to match the source material's
described dynamic per type: for `forbidden_reason`, answer by confidently
restating their own existing prescribing rationale (unmoved, reassured);
for `forbidden_indication`, answer vaguely or evasively ("that depends on
the patient..."), sounding mildly put on the spot; for
`effective_challenges`, answer with a concrete patient-need/challenge
(generic, no invented clinical specifics); for `effective_criteria`,
answer with the actual selection factors they weigh; for `other`, give a
brief, mildly unenthusiastic generic answer (the rep didn't ask anything
that opened the conversation up).

`parseQuestionJudgeResponse(text): { doctorText: string; questionType: QuestionType } | null`
— same brace-slicing/try-catch pattern as the other two modes.
`questionType` is **not** lenient-degraded to a default here (unlike
`criteriaHit`/`clearSteps`, which default to `[]` on a bad value) — if the
model returns something outside the five valid values, the whole parse
fails (returns `null`), because `questionType` is a required single field
the rest of the session depends on, not an optional accumulating set.

### Turn 2 — listening judge prompt

`buildListeningJudgePrompt(doctor, style, lang, historyContext, questionText, doctorAnswer, questionType, repResponseText)`
— includes the turn-1 exchange (the rep's question, the doctor's answer)
as context, then the rep's turn-2 response, and asks the judge to
identify which of the 3 `ListeningCue`s the response demonstrated:

```json
{
  "doctorText": "a short in-character close, 1-2 sentences — does the doctor feel heard or brushed past",
  "listeningCuesHit": ["restated", "paraphrased", "validatedFeelings"]
}
```

`parseListeningJudgeResponse(text): { doctorText: string; listeningCuesHit: ListeningCue[] } | null`
— same leniency as CLEAR's `clearSteps`/Opening Statement's `criteriaHit`:
`doctorText` is the only gating field; `listeningCuesHit` degrades to `[]`
on anything malformed rather than failing the whole parse (this field
behaves like an accumulating checklist, not a required classification —
same reasoning as why `questionType` above is strict and this isn't).

### New table: `voice_partner_question_sessions`

```sql
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
```

RLS: identical three-policy pattern to the other two voice-partner
tables (own read/insert scoped to `rep_id = auth.uid()` and doctor
ownership; manager read via the same company_id subquery).

## API changes

Three routes, mirroring the file-per-step convention already used by
objection mode's `open`/`turn`/`session-result` — except here there is no
loop, so `turn` becomes two distinct fixed-sequence endpoints:

- `POST /api/voice-partner/question-drill/ask` — turn 1. Multipart form
  (`doctorId`, `lang`, `audio`). Transcribes, builds
  `buildQuestionJudgePrompt`, calls Claude, returns
  `{ questionText, doctorText, questionType }`. Same auth/env-gate/rate-limit
  pattern (shared `voice-partner` bucket) as every other voice-partner
  route. No `/open` route needed, same reasoning as Opening Statement.

- `POST /api/voice-partner/question-drill/respond` — turn 2. Multipart
  form (`doctorId`, `lang`, `audio`, plus the client resending
  turn-1 state it needs to rebuild context: `questionText`, `doctorAnswer`,
  `questionType` — validated against the enum, 400 on anything invalid,
  same trust model as objection mode's resent `objectionType`).
  Transcribes the rep's turn-2 response, builds
  `buildListeningJudgePrompt`, calls Claude, returns
  `{ repResponseText, doctorText, listeningCuesHit }`.

- `POST /api/voice-partner/question-drill/session-result` — body
  `{ doctorId, questionType, listeningCuesHit }`. Looks up `style`
  server-side (never trust client), validates enums (strict — the whole
  request rejected if `listeningCuesHit` contains any invalid element,
  same stricter-than-judge-output pattern as the other two modes'
  session-result routes), inserts one row.

## UI changes

- `useQuestionDrill.ts` — a **two-stage** state machine (not single-shot
  like Opening Statement, not a loop like objection mode):
  `idle → recording(1) → sending(1) → playing(1) → recording(2) →
  sending(2) → playing(2) → idle`, plus `notconfigured`/`error`/
  `ratelimited` (carrying forward Opening Statement's rate-limit UX fix).
  Holds `questionType`, `doctorAnswer`, `questionText` from turn 1 (needed
  to resend to the `respond` route) and the final `listeningCuesHit` +
  closing `doctorText` from turn 2. Fires `session-result` best-effort
  after turn 2 resolves, same swallow-and-log pattern as the other two
  hooks.
- `QuestionDrill.tsx` — shows the doctor persona, a record control for
  each of the two turns in sequence (turn 2's control only becomes
  reachable after turn 1's `doctorText` has played), a mid-session
  indicator of which turn the rep is on, and a final result screen:
  the question-type verdict (three-tier visual treatment — good/missed
  opportunity/bad, not binary) plus the 3-item listening checklist,
  rendered via the existing `Feedback` component. **The `checklistHtml`
  string this screen builds must escape every dynamic interpolation
  (question type label, criteria labels, either `doctorText`) exactly
  like Opening Statement mode's `escapeHtml()` fix** — this app's judge
  outputs are free AI text, and the same XSS class of defect found and
  fixed in Opening Statement mode applies here identically; this module
  should reuse (import, not reimplement) Opening Statement's `escapeHtml`
  helper, or hoist it to a shared location if that reads better once both
  modes need it (implementer's call, per the plan's own file-structure
  section).
- `VisitPrep.tsx`: a third entry button in the same detail-screen action
  row as the other two voice-partner modes, a new `View` variant
  (`'questionDrill'`), a wrapper component logging a `doctor_visits` row
  only when the session actually completed (both turns finished) — same
  `completed`-gating pattern as Opening Statement's wrapper.
- `i18n.tsx` — new EN+AR keys: entry button, 5 question-type labels (+
  short explanatory line each — why forbidden ones backfire, what
  effective ones surface), 3 listening-cue labels, turn-progress copy,
  summary heading.

## Error handling

- `parseQuestionJudgeResponse`: `questionType` is a **strict, required**
  field — an invalid/missing value fails the whole parse (422), unlike
  the lenient-degrade pattern used everywhere else in this app's judge
  parsers. This is a deliberate deviation from the other two modes'
  convention, called out explicitly because a reviewer will otherwise
  flag the inconsistency — the reasoning is in the Data Model section
  above (it's a required classification, not an accumulating checklist).
- `parseListeningJudgeResponse`: `listeningCuesHit` degrades to `[]`,
  matching the established convention (`clearSteps`/`criteriaHit`).
- `respond` route: a resent `questionType` that isn't one of the 5 valid
  enum values → 400, same treatment as objection mode's resent
  `objectionType`.
- `session-result` insert failure: log + swallow client-side, matching
  both existing session-result routes.
- Rate limiting: shared `voice-partner` bucket, 20/hour — carried forward
  as-is. (The final review on Opening Statement mode flagged that six
  routes now share this one bucket without the ceiling being reconsidered,
  and deferred that as its own follow-up rather than a per-mode change —
  this spec doesn't reopen that question, but this mode's `ask` + `speak`
  + `respond` + `speak` + `session-result` costs up to 5 tokens per
  attempt, meaningful against the same 20/hour ceiling. Worth the user
  revisiting the ceiling itself in that separate follow-up, not here.)

## Testing

New `voice-partner-questioning.test.ts`, mirroring both prior modes'
lib-level test coverage:
- `isQuestionType`/`isListeningCue`: accept every valid value, reject
  invalid ones.
- `buildQuestionJudgePrompt`: includes doctor persona/style/language/
  history (same assertions as the other two modes' prompt-builder tests),
  includes the rep's question text verbatim, describes all 5
  `QuestionType` values including the `'other'` catch-all.
- `parseQuestionJudgeResponse`: valid parse; malformed JSON → null;
  missing/empty `doctorText` → null; **missing or invalid `questionType`
  → null (strict, not defaulted)** — this is the one test case that
  differs in kind from the other two modes' parser tests, and should be
  called out clearly in the test file so a future reader doesn't assume
  it's a copy-paste bug.
- `buildListeningJudgePrompt`: includes the turn-1 exchange (question +
  doctor's answer + the classified type) and the rep's turn-2 response,
  describes all 3 `ListeningCue`s including the "last three words"
  technique under `restated`.
- `parseListeningJudgeResponse`: valid parse; `listeningCuesHit` missing/
  non-array/unknown-values → filtered/defaulted to `[]`, same as the
  other two modes' lenient parsers; missing `doctorText` → null.

No API-route, hook, component, or migration test files — matches this
project's established convention (only `*-core.ts`/`*.test.ts` lib-level
tests exist anywhere in the codebase).
