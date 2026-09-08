# Closing & Commitment Drill Mode for AI Voice Partner

## Source

Manager workshop notes (`notesnotes.docx`, repo root, untracked) — the 3P
selling model's "Tailored Execution" stage, section E:

> Closing and taking commitment:
> A. Give a summary to show the level of agreement.
> B. Ask a question and keep silence — let the doctor reply.

This is the fifth and final backlog item from the same source (opening
statement — section A, built; forbidden/effective questions — section B,
built; features & benefits — section C, built; objection handling —
section D, already built earlier as the CLEAR model; closing — section E,
this spec). With this mode, all five backlog items from the source notes
are complete.

## Scope

In scope: AI voice partner only, as a fifth mode alongside the existing
objection/CLEAR, opening-statement, question-drill, and FAB modes. In
scope: new core prompt/judge module, new API route, new session-result
route, new hook, new UI screen, new persistence table, one new entry
button on the doctor detail screen.

Out of scope: a shared "mode" framework across the five voice-partner core
files. The FAB spec already flagged that Opening Statement and FAB are now
structurally near-identical, and this fifth mode makes the duplication
larger still — but extracting a shared `SingleShotVoiceDrill`
component/hook is a follow-up refactor, not part of this feature. Doing it
as part of this spec would mix a behavior change with a structural one;
call it out in this feature's PR/completion notes as the trigger point for
that refactor, but don't do it here.

Out of scope: the manager dashboard (same as every prior mode's table).

Out of scope: measuring actual silence. The judge only sees the Whisper
transcript of the rep's recorded statement — there is no way to detect
whether the rep stayed silent afterward from a transcript of what they
said before that point. The rubric approximates "then keep silent" as "the
statement itself ends on the commitment question, without the rep
continuing to talk past it (filling the silence themselves, which is
exactly the mistake the technique warns against)." This is a text-inferable
proxy, consistent with how Opening Statement approximates "40 seconds
spoken" as "concise wording" rather than measuring elapsed time.

## Decisions (from brainstorming)

1. **Single-turn, not multi-turn.** Like Opening Statement and FAB, the
   rep delivers one closing statement, judged once against a fixed rubric
   — no doctor pushback loop, no turn cap. (Unlike Question Drill, which
   is a fixed *two*-turn exchange — closing is naturally one utterance
   followed by silence, not a back-and-forth.)
2. **Rubric is a 4-item checklist**, scored in a single judge call:
   - `summarized_agreement` — recaps a specific point of agreement or
     interest that came up earlier in this visit (ties to
     `historyContext`, the same way Opening Statement's `relevant`
     criterion and FAB's `tailored` criterion use visit history).
   - `asked_commitment` — asks one clear, specific closing question (a
     concrete next step: a trial, a follow-up visit, a decision by a
     stated point) — not a vague "so what do you think?"
   - `ends_on_question` — the statement ends with that commitment
     question; the rep doesn't keep talking after asking it (padding,
     re-justifying, or answering their own question). This is the
     text-inferable proxy for "then keep silent" described above.
   - `concise` — short and focused, not a multi-point recap.
3. **No `/open` route.** The rep speaks first (delivers the closing
   statement) — there is nothing to fetch before recording, same as
   Opening Statement and FAB.
4. **The doctor still replies once, for flavor only.** After judging, the
   response includes a short in-character doctor reaction line
   (`doctorText`) — unscored, not part of the rubric, not persisted.
   Matches Opening Statement's and FAB's convention exactly.

## Data model

### `ClosingCriterion` (new, `src/lib/voice-partner-closing.ts`)

```ts
export type ClosingCriterion = 'summarized_agreement' | 'asked_commitment' | 'ends_on_question' | 'concise'
export const CLOSING_CRITERIA: readonly ClosingCriterion[] =
  ['summarized_agreement', 'asked_commitment', 'ends_on_question', 'concise']
export function isClosingCriterion(value: unknown): value is ClosingCriterion
```

Same shape and guard pattern as `OpeningCriterion`/`isOpeningCriterion` and
`FabCriterion`/`isFabCriterion`.

### Judge prompt

`buildClosingJudgePrompt(doctor, style, lang, historyContext, statementText)`
— reuses `personaLines()` and the same `SYSTEM` guardrail constant imported
from `voice-partner-core.ts`. Describes each of the 4 criteria inline
(mirroring `buildFabJudgePrompt`) and asks for:

```json
{
  "doctorText": "short in-character reaction, 1-2 sentences",
  "criteriaHit": ["summarized_agreement", "asked_commitment", "ends_on_question", "concise"]
}
```

`parseClosingJudgeResponse` follows `parseFabJudgeResponse`'s leniency:
`doctorText` is the only gating field (missing/empty → parse fails);
`criteriaHit` missing, non-array, or containing unknown strings → filtered
to the valid subset (default `[]`), never fails the whole parse.

### New table: `voice_partner_closing_sessions`

New migration `supabase/migrations/018_voice_partner_closing_sessions.sql`,
same structure and RLS as `017_voice_partner_fab_sessions.sql`:

```sql
create table public.voice_partner_closing_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);
```

RLS: identical three policies to `voice_partner_fab_sessions` (own
read/insert scoped to `rep_id = auth.uid()` and doctor ownership; manager
read via the same company_id subquery), renamed to the new table.

No `outcome`/`turn_count` columns — no verdict machine, always exactly one
take.

## API changes

- `POST /api/voice-partner/closing-statement` — multipart form: `doctorId`,
  `lang`, `audio`. Same auth, `AI_VOICE_PARTNER_ENABLED` gate, and
  rate-limit bucket (`voice-partner`, 20/hour, shared with all four other
  modes) as the existing routes. Transcribes the audio (Whisper), builds
  the judge prompt from the doctor persona + `buildHistoryContext`, calls
  Claude, parses, returns `{ repText, doctorText, criteriaHit }`.

- New `POST /api/voice-partner/closing-session-result` — body `{ doctorId,
  criteriaHit }`. Looks up the doctor's `style` server-side (never trust
  client-supplied style), inserts one row. Same auth + rate-limit bucket.
  `criteriaHit` validation here is STRICT (reject the whole request if any
  element is invalid) — same deliberate distinction as every prior
  session-result route, since this validates client-submitted data rather
  than AI judge output.

## UI changes

- New `src/hooks/useVoicePartnerClosing.ts` — single-shot state machine:
  `idle → recording → sending → playing → done`, mirroring
  `useVoicePartnerFab.ts` exactly. On `done`, fires
  `closing-session-result` best-effort (same swallow-and-log pattern).
- New `src/components/game/VoicePartnerClosing.tsx` — shows the doctor's
  persona card, a single record/stop control, then on completion renders
  the doctor's flavor line plus the 4-item checklist (✓ hit / — missed)
  via the existing `Feedback` component. Any HTML string built for
  `Feedback`'s `body` prop escapes dynamic interpolations via the shared
  `escapeHtml` helper (`./helpers`), same as every other mode.
- `VisitPrep.tsx`: add a `'voiceClosing'` `View` mode variant and a fifth
  entry button (same styling family as the other four, new i18n key) that
  launches `VoicePartnerClosingScreen` (a thin wrapper mirroring
  `VoicePartnerFabScreen`, owning `doctor_visits` logging).
- `src/types/game.ts`: extend `DoctorVisit['source']` with
  `'voice_partner_closing'`.
- `i18n.tsx` — new EN+AR keys: entry button label, teaser text, 4
  criterion labels (mirroring the FAB-criterion label keys — labels only,
  no separate description keys), summary screen heading, source label,
  visit-note template.

## Error handling

- `parseClosingJudgeResponse`: `criteriaHit` failures degrade to `[]`,
  never reject the response — `doctorText` is the only gating field.
- `closing-session-result` insert failure: log + swallow client-side — the
  rep still sees their checklist.
- Malformed `doctorId`/missing `audio` → 400, matching existing routes.
- Transcription failure → 502, matching existing routes.

## Testing

New `voice-partner-closing.test.ts`, mirroring
`voice-partner-fab.test.ts`'s coverage for the judge path:
- `buildClosingJudgePrompt` output contains all 4 criteria descriptions.
- `parseClosingJudgeResponse`: valid `criteriaHit` array passes through;
  missing field → `[]`; non-array → `[]`; array with unknown strings →
  filtered to valid subset; a response missing `doctorText` fails
  entirely.
- `isClosingCriterion` accepts the 4 valid values, rejects anything else.

No test file for the new API routes or the migration, matching this
project's existing convention.
