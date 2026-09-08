# Features & Benefits (FAB) Drill Mode for AI Voice Partner

## Source

Manager workshop notes (`notesnotes.docx`, repo root, untracked) — the 3P
selling model's "Tailored Execution" stage, section C:

> Features and benefits, providing solution: features are characteristics
> of the product; benefits are outcomes tailored to the patient or doctor.
> The golden rule for impactful communication is harmony between words,
> tone of voice, and body language. Rule two: find common ground — the
> patient is the common ground between rep and doctor.

This is the item directly after questioning (section B, built as Question
Drill mode) in the same "Tailored Execution" flow, and directly before
objection handling (section D, already built as the CLEAR model). It is
the third of four backlog items from the same source (opening statement —
section A, already built; forbidden/effective questions — section B,
already built; closing — section E, still open). This spec covers only
the FAB drill.

## Scope

In scope: AI voice partner only, as a fourth mode alongside the existing
objection/CLEAR, opening-statement, and question-drill modes. In scope:
new core prompt/judge module, new API route, new session-result route,
new hook, new UI screen, new persistence table, one new entry button on
the doctor detail screen.

Out of scope: a shared "mode" framework across the four voice-partner
core files. Each existing mode (objection/CLEAR, opening statement,
question drill) follows the same convention — separate core file,
separate route(s), separate table — and this spec follows it too. Revisit
generalization only if a fifth mode's shape reveals real duplication that
these four together don't already justify.

Out of scope: the manager dashboard. As with the other three tables, the
new table's RLS supports a future manager view but wiring it into
`app/dashboard` is a follow-up.

Out of scope: judging actual tone of voice or body language. The judge
only sees the Whisper transcript — same limitation the other three modes
already accept (e.g. Opening Statement's "concise" criterion judges
wording, not measured speaking time). The rubric below is deliberately
built from text-inferable signals only.

## Decisions (from brainstorming)

1. **Single-turn, not multi-turn.** Like Opening Statement (and unlike the
   objection/CLEAR loop or Question Drill's fixed two turns), the rep
   delivers one FAB statement, judged once against a fixed rubric — no
   doctor pushback loop, no turn cap.
2. **Rubric is a 4-item checklist**, scored in a single judge call:
   - `feature_stated` — names a concrete product feature or characteristic
     (generic — "your product's formulation", "the delivery mechanism" —
     never an invented/branded drug name or specific clinical claim, same
     no-invented-data guardrail as every other mode).
   - `benefit_linked` — connects that feature to an outcome or benefit, not
     just restating the feature in different words.
   - `tailored` — ties the benefit to this doctor's patient-type or need,
     using visit-history context the same way Opening Statement's
     "relevant" criterion does.
   - `patient_centered` — frames the benefit around the patient (the
     common ground per the source notes), not solely around the rep's or
     company's interest.
3. **No `/open` route.** The rep speaks first (presents the FAB
   statement) — there is nothing to fetch before recording, same as
   Opening Statement. The UI shows the doctor persona directly, then the
   rep records.
4. **The doctor still replies once, for flavor only.** After judging, the
   response includes a short in-character doctor reaction line
   (`doctorText`) — unscored, not part of the rubric, not persisted.
   Matches Opening Statement's convention exactly.

## Data model

### `FabCriterion` (new, `src/lib/voice-partner-fab.ts`)

```ts
export type FabCriterion = 'feature_stated' | 'benefit_linked' | 'tailored' | 'patient_centered'
export const FAB_CRITERIA: readonly FabCriterion[] =
  ['feature_stated', 'benefit_linked', 'tailored', 'patient_centered']
export function isFabCriterion(value: unknown): value is FabCriterion
```

Same shape and guard pattern as `OpeningCriterion`/`isOpeningCriterion`.

### Judge prompt

`buildFabJudgePrompt(doctor, style, lang, historyContext, statementText)` —
reuses `personaLines()` and the same `SYSTEM` guardrail constant imported
from `voice-partner-core.ts`. Describes each of the 4 criteria inline
(mirroring `buildOpeningJudgePrompt`) and asks for:

```json
{
  "doctorText": "short in-character reaction, 1-2 sentences",
  "criteriaHit": ["feature_stated", "benefit_linked", "tailored", "patient_centered"]
}
```

`parseFabJudgeResponse` follows `parseOpeningJudgeResponse`'s leniency:
`doctorText` is the only gating field (missing/empty → parse fails);
`criteriaHit` missing, non-array, or containing unknown strings → filtered
to the valid subset (default `[]`), never fails the whole parse.

### New table: `voice_partner_fab_sessions`

New migration `supabase/migrations/017_voice_partner_fab_sessions.sql`,
same structure and RLS as `015_voice_partner_opening_sessions.sql`:

```sql
create table public.voice_partner_fab_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  criteria_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);
```

RLS: identical three policies to `voice_partner_opening_sessions` (own
read/insert scoped to `rep_id = auth.uid()` and doctor ownership; manager
read via the same company_id subquery), renamed to the new table.

No `outcome`/`turn_count` columns — no verdict machine, always exactly one
take.

## API changes

- `POST /api/voice-partner/fab-statement` — multipart form: `doctorId`,
  `lang`, `audio`. Same auth, `AI_VOICE_PARTNER_ENABLED` gate, and
  rate-limit bucket (`voice-partner`, 20/hour, shared with the other three
  modes) as the existing routes. Transcribes the audio (Whisper), builds
  the judge prompt from the doctor persona + `buildHistoryContext`, calls
  Claude, parses, returns `{ repText, doctorText, criteriaHit }`.

- New `POST /api/voice-partner/fab-session-result` — body `{ doctorId,
  criteriaHit }`. Looks up the doctor's `style` server-side (never trust
  client-supplied style), inserts one row. Same auth + rate-limit bucket.

## UI changes

- New `src/hooks/useVoicePartnerFab.ts` — single-shot state machine:
  `idle → recording → sending → playing → done` (no `outcome`, no
  `turnCount`, no transcript accumulation loop), mirroring
  `useVoicePartnerOpening.ts` exactly. On `done`, fires
  `fab-session-result` best-effort (same swallow-and-log pattern).
- New `src/components/game/VoicePartnerFab.tsx` — shows the doctor's
  persona card, a single record/stop control, then on completion renders
  the doctor's flavor line plus the 4-item checklist (✓ hit / — missed)
  via the existing `Feedback` component. Any HTML string built for
  `Feedback`'s `body` prop escapes dynamic interpolations via the shared
  `escapeHtml` helper (`./helpers`), same as every other mode.
- `VisitPrep.tsx`: add a `'voiceFab'` `View` mode variant and a fourth
  entry button (same styling family as the other three, new i18n key)
  that launches `VoicePartnerFabScreen` (a thin wrapper mirroring
  `VoicePartnerOpeningScreen`, owning `doctor_visits` logging).
- `src/types/game.ts`: extend `DoctorVisit['source']` with
  `'voice_partner_fab'`.
- `i18n.tsx` — new EN+AR keys: entry button label, teaser text, 4
  criterion labels (mirroring the opening-criterion label keys, which are
  labels only — no separate description keys), summary screen heading,
  source label, visit-note template.

## Error handling

- `parseFabJudgeResponse`: `criteriaHit` failures degrade to `[]`, never
  reject the response — `doctorText` is the only gating field, same
  philosophy as the other three modes.
- `fab-session-result` insert failure: log + swallow client-side — the rep
  still sees their checklist.
- Malformed `doctorId`/missing `audio` → 400, matching the existing
  routes' validation.
- Transcription failure → 502, matching the existing routes' behavior.

## Testing

New `voice-partner-fab.test.ts`, mirroring
`voice-partner-opening.test.ts`'s coverage for the judge path:
- `buildFabJudgePrompt` output contains all 4 criteria descriptions.
- `parseFabJudgeResponse`: valid `criteriaHit` array passes through;
  missing field → `[]`; non-array → `[]`; array with unknown strings →
  filtered to valid subset; a response missing `doctorText` fails
  entirely.
- `isFabCriterion` accepts the 4 valid values, rejects anything else.

No test file for the new API routes or the migration, matching this
project's existing convention.
