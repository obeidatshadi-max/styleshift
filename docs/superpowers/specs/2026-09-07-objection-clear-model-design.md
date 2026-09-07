# Objection Taxonomy + CLEAR Model for AI Voice Partner

## Source

Manager requirements captured in `edits.docx` (repo root), points 6 and 7:

- **Point 6** — the AI voice partner should give different *kinds* of
  objections: (a) wrong info the rep must correct, (b) doubt the rep should
  answer with third-party evidence, (c) a true objection the rep should
  normalize/generalize rather than dismiss, (d) indifference the rep should
  probe with open questions.
- **Point 7** — objection handling should be taught/scored against the
  **CLEAR** model: **C**larify (ask open questions), **L**isten (paraphrase
  or repeat back), **E**mpathy (acknowledge feeling), **A**nswer (per
  objection type), **R**echeck (confirm resolution).

## Scope

In scope: AI voice partner only (`src/lib/voice-partner-core.ts` and its two
API routes). Colleague-vs-colleague roleplay is out of scope — that flow has
no AI judge today, only post-hoc talk-ratio/paraphrase analytics
(`roleplay-core.ts`), and extending it is a separate future task.

Out of scope: surfacing this data on the manager dashboard. The DB
table + RLS are built to support it, but wiring it into
`app/dashboard` and the SPS recommendation logic is a follow-up spec.
Whoever writes that follow-up spec should note: `session-result` rows are
client-asserted practice self-reports with no server-side session state to
validate against (each voice-partner session has no server-side record until
the final POST) — a manager-facing view must present them as self-reports,
not audited results.

## Decisions (from brainstorming)

1. Objection type is picked **randomly server-side** at session open, not
   manager-selected. Varied practice, zero new assignment UI.
2. CLEAR feedback is an **end-of-session summary only** — no live per-turn
   tag chips. Keeps `VoicePartner.tsx` turn loop unchanged; only the
   terminal screen changes.
3. Session results **are persisted** (new table), even though voice-partner
   turns themselves stay stateless. One row per session, written once, at
   the terminal outcome (`won` / `escalated`).

## Data model

### `ObjectionType` (new, `voice-partner-core.ts`)

```ts
export type ObjectionType = 'wrong_info' | 'doubt' | 'true_objection' | 'indifference'
export const OBJECTION_TYPES: readonly ObjectionType[] =
  ['wrong_info', 'doubt', 'true_objection', 'indifference']
export function pickObjectionType(): ObjectionType // uniform random
```

Each type maps to a one-paragraph instruction fragment injected into both
`buildOpeningPrompt` and `buildJudgePrompt`, telling the AI doctor *how* to
raise and sustain that flavor of resistance:

- `wrong_info` — state a mistaken belief about "your product" (never a real
  drug fact — reuse the existing no-real-data guardrail); rep must correct
  it diplomatically without inventing data of their own.
- `doubt` — voice skepticism about efficacy/safety; rep should reference
  "the evidence pack" / third-party data (generic terms, same guardrail as
  today).
- `true_objection` — raise a real, known concern (e.g. a side-effect
  theme already in `doctor.objections`); rep should normalize/generalize
  it, not dismiss it.
- `indifference` — low engagement, no strong objection voiced; rep must
  ask open questions to surface the real concern.

### `ClearStep` (new, `voice-partner-core.ts`)

```ts
export type ClearStep = 'clarify' | 'listen' | 'empathy' | 'answer' | 'recheck'
export const CLEAR_STEPS: readonly ClearStep[] =
  ['clarify', 'listen', 'empathy', 'answer', 'recheck']
```

The judge prompt's returned JSON shape grows from `{verdict, doctorReply}`
to `{verdict, doctorReply, clearSteps}`, where `clearSteps` is a subset of
`CLEAR_STEPS` the doctor-judge believes the rep's *most recent reply*
demonstrated. `parseJudgeResponse` treats `clearSteps` leniently: missing,
non-array, or containing unknown strings → filter down to the valid subset
(default `[]`) — it must never fail the whole parse, since verdict/reply are
the only fields that gate the conversation.

The client (`useVoicePartner.ts`) accumulates the **union** of `clearSteps`
seen across all turns into a `Set<ClearStep>` for the session.

### New table: `voice_partner_sessions`

```sql
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
```

RLS: copy the `roleplay_sessions` pattern exactly —
- `own voice_partner_sessions read/insert` — `rep_id = auth.uid()`
- `manager voice_partner_sessions read` — same company_id subquery as
  `roleplay_sessions`'s manager policy.

No update/delete policies — sessions are write-once, matching
`roleplay_sessions`.

## API changes

- `POST /api/voice-partner/open` — now also calls `pickObjectionType()` and
  returns `{ doctorText, objectionType }`.
- `POST /api/voice-partner/turn` — accepts a resent `objectionType` form
  field (same trust model as `history`: client resends server-issued state,
  validated against the `ObjectionType` enum, 400 on anything else). Returns
  `{ repText, doctorText, outcome, turnCount, clearSteps }`.
- New `POST /api/voice-partner/session-result` — body
  `{ doctorId, objectionType, outcome, clearSteps, turnCount }`. Looks up
  the doctor's `style` server-side (never trust a client-supplied style),
  validates enums, inserts one row. Same auth + rate-limit bucket
  (`voice-partner`, 20/hour) as the other three routes.

## UI changes

- `useVoicePartner.ts` — holds `objectionType` (from `open`) and a running
  `Set<ClearStep>` (updated from each `turn` response); on terminal outcome,
  fires `session-result` (best-effort — a failed save doesn't block the rep
  from seeing their summary).
- No new `VoicePartnerSummary.tsx` component was added. Instead, on
  `outcome !== 'continue'`, `VoicePartner.tsx` builds an HTML string —
  objection type faced (translated label) plus a 5-row CLEAR checklist
  (✓ hit / — missed) — and passes it as the `body` prop to the existing
  `Feedback` component (already used elsewhere in `VoicePartner.tsx` for the
  win/escalate message), avoiding a duplicate verdict panel.
- `i18n.tsx` — new EN+AR keys: 4 objection-type labels, 5 CLEAR-step labels
  (+ one-line description each), summary screen headings.

## Error handling

- `pickObjectionType()` is pure/local — can't fail.
- Judge prompt parsing: `clearSteps` failures degrade to `[]`, never reject
  the response (verdict + doctorReply remain the only gating fields, as
  today).
- `session-result` insert failure: log + swallow client-side (matches the
  project's existing "silent insert failures" fix pattern noted in commit
  `9226b97` — don't regress that by throwing here); the rep still sees the
  summary screen either way, it just may not be saved.
- `turn` route: an `objectionType` resent by the client that isn't one of
  the 4 valid enum values → 400, same treatment as malformed `history`
  today.

## Testing

Extend `voice-partner-core.test.ts`:
- `pickObjectionType()` always returns one of the 4 valid values (loop
  N times, assert membership).
- `buildOpeningPrompt` / `buildJudgePrompt` output contains the
  type-specific instruction fragment for each of the 4 types.
- `parseJudgeResponse`: valid `clearSteps` array passes through; missing
  field → `[]`; non-array → `[]`; array with unknown strings → filtered to
  valid subset; a response missing `verdict`/`doctorReply` still fails
  entirely (unchanged behavior).

No API routes in this repo have test files today (only `*-core.ts` /
`*.test.ts` lib-level unit tests exist) — `session-result` follows that
convention and isn't unit tested either; its enum validation is inline in
the route, same as `parseHistory` in `turn/route.ts` today.

Migration: no test file (matches project convention — migrations aren't
unit tested, just applied).
