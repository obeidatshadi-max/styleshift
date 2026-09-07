# Opening Statement Mode for AI Voice Partner

## Source

Manager workshop notes (`notesnotes.docx`, repo root, untracked) — the 3P
selling model's "Tailored Execution" stage, section A:

> After a full diagnosis (collecting data) and setting objectives, the call
> opens with an **effective introduction statement**. It should raise
> attention and interest before you ask anything. Start with a specific
> problem or challenge the doctor faces in real practice — a particular
> patient profile or disease area — then present the unique solution. This
> statement takes almost 40 seconds: concise, not a long pitch.

This is the item directly before objection handling (section D, already
built as the CLEAR model) in the same "Tailored Execution" flow. It is the
first of four backlog items from the same source (forbidden/effective
questions — section B; closing — section E; post-call checklist — section
F); this spec covers only the opening statement.

## Scope

In scope: AI voice partner only, as a second mode alongside the existing
objection/CLEAR mode. In scope: new core prompt/judge module, new API
route, new hook, new UI screen, new persistence table, one new entry button
on the doctor detail screen.

Out of scope: a shared "mode" framework across `voice-partner-core.ts` and
the opening-statement module. With only two modes in existence, unifying
them into one generalized engine (shared table with a `mode` discriminator,
shared routes) would be premature — this spec follows the existing
convention (separate core file, separate route, separate table) matching
how objection/CLEAR itself was added. Revisit generalization if a third
mode's shape reveals real duplication.

Out of scope: the manager dashboard. As with `voice_partner_sessions`, the
new table's RLS supports a future manager view but wiring it into
`app/dashboard` is a follow-up.

## Decisions (from brainstorming)

1. **Single-turn, not multi-turn.** Objection mode is a multi-exchange loop
   with a `win`/`escalate`/`continue` verdict machine (`resolveTurn`,
   `TURN_CAP`). The opening statement is one recorded statement, judged
   once against a fixed rubric — no doctor pushback loop, no turn cap.
2. **Rubric is a 4-item checklist**, structurally the same idea as the 5
   `ClearStep`s (a set of criteria the judge marks as hit/missed), scored
   in a single judge call rather than accumulated across turns:
   - `problem_led` — opens with a specific patient/clinical problem or
     challenge, not generic small talk or a product pitch.
   - `relevant` — the problem is one this doctor's patient type would
     plausibly face (ties to the doctor persona's specialty/patient
     profile).
   - `solution_linked` — the statement connects that problem to the
     product's unique solution (generic reference only — "your product",
     "the evidence pack" — same no-invented-data guardrail as objection
     mode).
   - `concise` — delivered as a short, focused statement (~40 seconds
     spoken, not a multi-point pitch).
3. **No `/open` route.** Objection mode's `/open` route exists because the
   AI doctor speaks first (the objection). Here the rep speaks first —
   there is nothing to fetch before recording. The UI shows the doctor's
   persona (name, specialty, patient-profile hints already on `Doctor`)
   directly, then the rep records.
4. **The doctor still replies once, for flavor only.** After judging, the
   response includes a short in-character doctor reaction line
   (`doctorText`) — unscored, purely to keep the "the doctor responds" feel
   consistent with the rest of the voice partner. It is not part of the
   rubric and not persisted.

## Data model

### `OpeningCriterion` (new, `src/lib/voice-partner-opening.ts`)

```ts
export type OpeningCriterion = 'problem_led' | 'relevant' | 'solution_linked' | 'concise'
export const OPENING_CRITERIA: readonly OpeningCriterion[] =
  ['problem_led', 'relevant', 'solution_linked', 'concise']
export function isOpeningCriterion(value: unknown): value is OpeningCriterion
```

Same shape and guard pattern as `ClearStep`/`isClearStep` in
`voice-partner-core.ts`.

### Judge prompt

`buildOpeningJudgePrompt(doctor, style, lang, historyContext, statementText)`
— reuses `personaLines()`-equivalent persona framing and the same `SYSTEM`
guardrail constant imported from `voice-partner-core.ts` (no invented
clinical data, generic "your product"/"the evidence pack" references,
never break character). Describes each of the 4 criteria inline (mirroring
how `buildJudgePrompt` describes the 5 CLEAR steps today) and asks for:

```json
{
  "doctorText": "short in-character reaction, 1-2 sentences",
  "criteriaHit": ["problem_led", "relevant", "solution_linked", "concise"]
}
```

`parseOpeningJudgeResponse` follows `parseJudgeResponse`'s leniency:
`doctorText` is the only gating field (missing/empty → parse fails);
`criteriaHit` missing, non-array, or containing unknown strings → filtered
to the valid subset (default `[]`), never fails the whole parse.

### New table: `voice_partner_opening_sessions`

New migration `supabase/migrations/015_voice_partner_opening_sessions.sql`,
same structure and RLS as `014_voice_partner_sessions.sql`:

```sql
create table public.voice_partner_opening_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);
```

RLS: identical three policies to `voice_partner_sessions` (own read/insert
scoped to `rep_id = auth.uid()` and doctor ownership; manager read via the
same company_id subquery), renamed to the new table.

No `outcome`/`turn_count` columns — there is no verdict machine and always
exactly one take.

## API changes

New route, replacing the two-route (`open`+`turn`) shape with one call
since there's only a single exchange:

- `POST /api/voice-partner/opening-statement` — multipart form:
  `doctorId`, `lang`, `audio`. Same auth, `AI_VOICE_PARTNER_ENABLED` gate,
  and rate-limit bucket (`voice-partner`, 20/hour — shared with objection
  mode, since both are upstream AI-call pairs) as the existing routes.
  Transcribes the audio (Whisper), builds the judge prompt from the doctor
  persona + `buildHistoryContext` (same visit-history injection as
  objection mode), calls Claude, parses, returns
  `{ repText, doctorText, criteriaHit }`.

  The `transcribe()` helper currently lives inline in `turn/route.ts`.
  Move it to `src/lib/voice-partner-core.ts` (or a new
  `src/lib/voice-partner-shared.ts` if that file is judged to be growing
  unfocused) so both routes import the same implementation instead of
  duplicating it.

- New `POST /api/voice-partner/opening-session-result` — body
  `{ doctorId, criteriaHit }`. Looks up the doctor's `style` server-side
  (never trust client-supplied style, same as the existing
  `session-result` route), inserts one row. Same auth + rate-limit bucket.

## UI changes

- New `src/hooks/useVoicePartnerOpening.ts` — single-shot state machine:
  `idle → recording → sending → playing → done` (no `outcome`, no
  `turnCount`, no transcript accumulation loop). On `done`, fires
  `opening-session-result` best-effort (same swallow-and-log pattern as
  `saveSessionResult` today — a failed save must not block the rep from
  seeing their checklist).
- New `src/components/game/VoicePartnerOpening.tsx` — shows the doctor's
  persona card, a single record/stop control, then on completion renders
  the doctor's flavor line plus the 4-item checklist (✓ hit / — missed)
  via the existing `Feedback` component, same pattern objection mode uses
  for its CLEAR summary.
- `VisitPrep.tsx`: add a `'voiceOpening'` `View` mode variant and a second
  entry button next to the existing `voice.entryButton` (same row, same
  button styling family, new i18n key) that launches
  `VoicePartnerOpeningScreen` (a thin wrapper mirroring `VoicePartnerScreen`
  at line 459).
- `i18n.tsx` — new EN+AR keys: entry button label, 4 criterion labels (+
  one-line description each, mirroring the CLEAR-step description keys),
  summary screen heading.

## Error handling

- `parseOpeningJudgeResponse`: `criteriaHit` failures degrade to `[]`,
  never reject the response — `doctorText` is the only gating field, same
  philosophy as `clearSteps` in the existing judge parser.
- `opening-session-result` insert failure: log + swallow client-side, same
  as `session-result` today — the rep still sees their checklist.
- Malformed `doctorId`/missing `audio` → 400, matching the existing routes'
  validation.
- Transcription failure (`transcribe()` returns null) → 502, matching
  `turn/route.ts`'s existing behavior.

## Testing

New `voice-partner-opening.test.ts`, mirroring
`voice-partner-core.test.ts`'s coverage for the judge path:
- `buildOpeningJudgePrompt` output contains all 4 criteria descriptions.
- `parseOpeningJudgeResponse`: valid `criteriaHit` array passes through;
  missing field → `[]`; non-array → `[]`; array with unknown strings →
  filtered to valid subset; a response missing `doctorText` fails entirely.
- `isOpeningCriterion` accepts the 4 valid values, rejects anything else.

No test file for the new API routes or the migration, matching this
project's existing convention (only `*-core.ts`/`*.test.ts` lib-level unit
tests exist; routes and migrations are untested by convention, noted
explicitly in the objection/CLEAR spec).
