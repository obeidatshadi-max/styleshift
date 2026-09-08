# Specialty-Aware AI Doctor + Quick Practice Launcher

## Source

User request (this session, not from `notesnotes.docx`): let a rep pick the
AI doctor's medical specialty and social style directly, so the voice-partner
roleplay feels like a real, live call — and have the AI's objections,
questions, and answers actually reflect that specialty's typical concerns
(crossed with the chosen social style), not just a loosely-used label.

Today, `Doctor.specialty` is free text and already flows into every
voice-partner prompt via `personaLines()` (`src/lib/voice-partner-core.ts:62`),
but nothing engineers the AI to vary its *content* by specialty the way
`OBJECTION_INSTRUCTIONS` already varies it by objection type. Separately,
starting any voice-partner mode today requires first creating a full saved
doctor profile (name, specialty, workplace, etc.) via the doctor list screen
— there's no fast path to "just pick a specialty and a style and start
practicing."

## Scope

Three pieces, shipped together as one feature:

1. **Specialty enum + domain-flavor prompt engine** — a curated, finite
   `Specialty` type with a per-specialty "domain of concerns" lookup table
   injected into `personaLines()`, so all 5 existing voice-partner modes
   (objection/CLEAR, opening statement, question drill, FAB, closing) get
   specialty-flavored AI behavior for free, no per-mode changes.
2. **Doctor form migration** — the existing free-text specialty `<input>`
   becomes a chip picker over the same curated list, mirroring the existing
   style-chip UI already in that form.
3. **Quick Practice launcher** — a new entry point on the doctor list screen:
   pick a specialty, pick a style, and land directly on a doctor detail
   screen with all 5 voice-partner modes ready to go — no other fields to
   fill in.

Out of scope: changing the `doctors.specialty` database column type. It
stays `text`. The curated list is enforced only at the UI layer going
forward; existing free-text values on already-saved doctors are left as-is
(see Data model below for the fallback behavior).

Out of scope: any new database table, any new API route, any change to the
`useDoctorVisits` visit-logging plumbing, or to any of the 10 existing
voice-partner API routes. The Quick Practice launcher reuses the existing
`doctors` table and `useDoctors().saveDoctor()` — it just creates a normal
doctor row through the normal path, with sensible defaults, and navigates
straight to it. Every voice-partner mode already works against any doctor
row unconditionally; nothing about them needs to know a doctor came from
the quick launcher versus the full form.

Out of scope: retroactively re-flavoring the 5 existing objection-type
instructions per specialty (a cardiology-flavored `true_objection` vs a
pediatrics-flavored one). The specialty domain-flavor and the objection-type
instruction are two independent, orthogonal axes injected side by side in
the same prompt — the model combines them itself. Building a
specialty×objection-type cross-product table (40 entries) is unwarranted
complexity for a first version; revisit only if flavor quality proves
insufficient in practice.

## Decisions (from brainstorming)

1. **Eight curated specialties** (the standard pharma-rep call panel):
   `cardiology`, `endocrinology`, `oncology`, `pediatrics`,
   `general_practice`, `dermatology`, `respiratory`,
   `psychiatry_neurology`.
2. **Domain-flavor, not fabricated facts.** Each specialty's prompt
   instruction names a *domain* of plausible concern categories (e.g.
   "cardiovascular risk, drug interactions with other cardiac medications,
   long-term safety") for the model to draw from — it never supplies actual
   clinical claims, statistics, or dosages. This sits entirely inside the
   existing `SYSTEM` guardrail (`voice-partner-core.ts:13-20`), which still
   forbids inventing clinical data; the domain-flavor only steers *which*
   generic categories of concern the model reaches for, not what specific
   facts it states.
3. **`Doctor.specialty` stays `string | null` in the type and DB.** The
   `Specialty` union is a UI/prompt-layer concept. `personaLines()` looks up
   `SPECIALTY_CONTEXT[d.specialty as Specialty]` and simply omits the extra
   domain-flavor line if the stored value isn't one of the 8 known keys
   (old free-text doctors, or a null specialty) — graceful degradation to
   today's behavior, not a breaking migration, not a backfill.
4. **Quick Practice creates a real doctor row**, not a separate ephemeral
   entity. Rationale: every mode's session-result routes, RLS policies, and
   visit-history logging already key off `doctor_id`; inventing a
   "doctor-less" code path would mean touching 10 existing routes and 5
   hooks for a UI convenience. Auto-naming a real row and reusing
   `saveDoctor()` is a few lines against already-proven infrastructure.
5. **Auto-generated name.** The created doctor's `name` is
   `"{Specialty label} Practice"` (e.g. "Cardiology Practice"), and if the
   rep already has one or more doctors with that exact name, a counter is
   appended ("Cardiology Practice 2") so the list stays legible. All other
   `DoctorInput` fields are `null`/`[]` (workplace, key_phrases, notes,
   objections, objection_notes, assertiveness, responsiveness) — the rep
   can rename/flesh it out later via the normal edit form if they want to
   keep it as a recurring practice partner; nothing distinguishes a
   quick-created doctor from a manually-created one after the fact.
6. **Style is required to start; specialty is required too.** Both pickers
   must have a selection before the "Start Practicing" button is enabled —
   unlike the full doctor form (where specialty is optional and style has a
   "help me figure it out" derivation mode), Quick Practice's entire point
   is committing to both up front for a focused scenario.

## Data model

### `Specialty` (new, `src/types/game.ts`, alongside `StyleKey`)

```ts
export type Specialty =
  | 'cardiology' | 'endocrinology' | 'oncology' | 'pediatrics'
  | 'general_practice' | 'dermatology' | 'respiratory' | 'psychiatry_neurology'

export interface SpecialtyDef { name: string; icon: string }
```

### `SPECIALTIES` / `SPECIALTIES_AR` (new, `src/lib/game-data.ts` / `game-data-ar.ts`)

Same shape and pattern as the existing `STYLES: Record<StyleKey, StyleDef>` /
`STYLES_AR`:

```ts
// game-data.ts
export const SPECIALTIES: Record<Specialty, SpecialtyDef> = {
  cardiology:            { name: 'Cardiology',              icon: '♡' },
  endocrinology:         { name: 'Endocrinology',           icon: '⚖' },
  oncology:              { name: 'Oncology',                icon: '✚' },
  pediatrics:            { name: 'Pediatrics',               icon: '★' },
  general_practice:      { name: 'General Practice',         icon: '●' },
  dermatology:           { name: 'Dermatology',              icon: '◐' },
  respiratory:           { name: 'Respiratory',              icon: '≈' },
  psychiatry_neurology:  { name: 'Psychiatry & Neurology',   icon: '◈' },
}
export const SPECIALTY_ORDER: Specialty[] = [
  'cardiology', 'endocrinology', 'oncology', 'pediatrics',
  'general_practice', 'dermatology', 'respiratory', 'psychiatry_neurology',
]
```

`game-data-ar.ts` mirrors with Arabic `name` values, same keys/icons.
`useGameData()` (`src/lib/i18n.tsx:989-994`) is extended to also return
`SPECIALTIES`/`SPECIALTY_ORDER` (EN or AR pair, selected by `lang`, exactly
like it already does for `STYLES`/`STYLE_ORDER`).

### `SPECIALTY_CONTEXT` (new, `src/lib/voice-partner-core.ts`, alongside `OBJECTION_INSTRUCTIONS`)

```ts
export const SPECIALTY_CONTEXT: Record<Specialty, string> = {
  cardiology: 'Concerns in this domain typically center on cardiovascular risk profile, drug-drug interactions with other cardiac medications, and long-term safety — draw on these domains generically, never invented statistics.',
  endocrinology: 'Concerns in this domain typically center on adherence over chronic long-term use, monitoring burden, and interactions with comorbid conditions.',
  oncology: 'Concerns in this domain typically center on efficacy versus quality-of-life trade-offs, treatment burden, and how this fits alongside other therapies.',
  pediatrics: 'Concerns in this domain typically center on dosing across different ages/weights, compliance and palatability for children, and burden on caregivers.',
  general_practice: 'You are a generalist gatekeeper, not a narrow specialist — concerns are broad: does this fit a wide range of patients, referral thresholds, and time pressure in a busy practice.',
  dermatology: 'Concerns in this domain typically center on visible side effects, treatment duration, and cosmetic tolerance.',
  respiratory: 'Concerns in this domain typically center on inhaler/device technique, exacerbation history, and comorbid conditions.',
  psychiatry_neurology: 'Concerns in this domain typically center on adherence and stigma, titration/onset concerns, and cognitive or sedative side effects.',
}

export function isSpecialty(value: unknown): value is Specialty {
  return typeof value === 'string' && value in SPECIALTY_CONTEXT
}
```

`personaLines()` changes from:

```ts
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialty = d.specialty ? `, ${d.specialty}` : ''
  ...
  return `You are ${d.name}${specialty}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${phrases}
${objections}`
}
```

to:

```ts
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialty = d.specialty ? `, ${d.specialty}` : ''
  const domainFlavor = isSpecialty(d.specialty) ? SPECIALTY_CONTEXT[d.specialty] : ''
  ...
  return `You are ${d.name}${specialty}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${domainFlavor}
${phrases}
${objections}`
}
```

`d.specialty` stores the enum's raw string key (e.g. `'cardiology'`), not
the display label — so the persona line itself (`"You are Dr. X,
cardiology, ..."`) reads a raw slug rather than "Cardiology". Fix: build the
specialty clause from the display label, not the raw value —
`SPECIALTIES[d.specialty as Specialty]?.name ?? d.specialty` (falls back to
the raw stored string for old free-text values, matching the same
graceful-degradation principle as the domain-flavor lookup).

No new database migration — `doctors.specialty` remains a plain `text`
column; the 8 curated values are just particular strings written into it by
the new UI, indistinguishable at the DB layer from any other free text.

## UI changes

### Doctor form (`src/components/game/VisitPrep.tsx`, `DoctorForm`)

Replace the specialty `<input>` (currently `src/components/game/VisitPrep.tsx:312`)
with a chip picker over `SPECIALTY_ORDER`, using the exact same `chip()`
style helper already defined in `DoctorForm` (`VisitPrep.tsx:290-294`) that
the style picker uses — visually identical pattern, just a different data
source and `specialty: Specialty | null` state instead of a string. Existing
doctors whose stored `specialty` isn't one of the 8 keys show with no chip
selected (none of the 8 will match) — the rep can pick a new one to replace
it, or leave it alone (submitting the form without touching the specialty
picker sends `null`... **decision needed at plan time**: should leaving an
unrecognized legacy value untouched preserve it, or does opening the chip
picker force a re-selection? Resolve in the plan by initializing the picker
state to the existing value if it happens to match a known key, and to
`null` otherwise — if the rep doesn't interact with the picker for a
legacy-valued doctor, the old free-text value should NOT be silently wiped
to null on save. This means `specialty` state must default-preserve the
raw string when saving, only overwriting when the rep actively picks a chip.

### Quick Practice launcher (new)

- New `View` variant: `{ mode: 'quickPractice' }` (no `doctor` payload — it
  doesn't exist yet).
- New button on the doctor list screen (`VisitPrep.tsx`, the `mode ===
  'list'` panel, immediately after the existing `t('prep.addDoctor')`
  button at `VisitPrep.tsx:239`): `t('prep.quickPractice')`, opens
  `{ mode: 'quickPractice' }`.
- New component `QuickPractice.tsx` (`src/components/game/`): two chip
  pickers stacked (specialty first, then style — reusing `SPECIALTY_ORDER`/
  `STYLE_ORDER` and the same chip visual pattern as `DoctorForm`), a
  "Start Practicing" primary button (disabled until both are picked), and a
  cancel/back ghost button. On confirm:
  1. Compute the auto-name: `"{SPECIALTIES[specialty].name} Practice"`,
     appending a counter if a doctor with that exact name already exists in
     the rep's list (`doctors` from `useDoctors()`, already loaded in the
     parent `VisitPrep`).
  2. Call `saveDoctor({ name, specialty, workplace: null, style,
     assertiveness: null, responsiveness: null, key_phrases: null,
     objections: [], objection_notes: null, notes: null })`.
  3. On success, `setView({ mode: 'detail', doctor: created })` — lands
     directly on the doctor detail screen with all 5 voice-partner entry
     buttons visible (the `style && panel(...)` cheat-panel block already
     renders for any doctor with a non-null `style`, which Quick Practice
     always sets).
  4. On failure (network/RLS error), show an inline error and let the rep
     retry — no partial state to reconcile since nothing was created.
- `i18n.tsx` — new EN+AR keys: `prep.quickPractice` (button label),
  `prep.quickPracticeTitle`/`subtitle` (screen heading/blurb),
  `prep.specialtyLabel` (reuses `prep.specialty` if wording matches, else a
  new key), `prep.quickPracticeStart` (button), plus the 8 specialty names
  going through `SPECIALTIES`/`SPECIALTIES_AR` rather than raw `t()` keys
  (matches how `STYLES`/`STYLES_AR` names are already not separately
  i18n-keyed — the language switch is handled by `useGameData()` picking
  the EN or AR data object, not by `t()` lookups).

## Error handling

- `saveDoctor` returning `null` (auth/RLS failure) in the Quick Practice
  flow: show an inline error message, stay on the picker screen, let the
  rep retry — do not navigate anywhere.
- Legacy free-text `specialty` values: never trigger an error anywhere:
  `isSpecialty()` returning `false` is a normal, expected path (see Decision
  3) — not a validation failure.

## Testing

New `voice-partner-core.test.ts` additions (this file already exists and
tests `personaLines`/`buildJudgePrompt`/etc.):
- `personaLines` includes the specialty's domain-flavor text when
  `doctor.specialty` is a recognized key.
- `personaLines` omits any domain-flavor line (no stray empty-string
  artifacts) when `doctor.specialty` is `null` or an unrecognized legacy
  string — and still includes the raw specialty in the intro clause via the
  display-label lookup fallback.
- `personaLines` renders the specialty's *display label* (e.g.
  "Cardiology"), not the raw enum key (`cardiology`), in the intro clause.
- `isSpecialty` accepts the 8 valid keys, rejects arbitrary strings,
  `null`, and non-string values.

No test file for `QuickPractice.tsx` or the `DoctorForm` chip-picker change
(matches this project's convention — `game/*.tsx` components are untested
by convention throughout this codebase).

## Self-Review Notes

- **Spec coverage:** Data model → `Specialty`/`SPECIALTIES`/
  `SPECIALTY_CONTEXT`/`personaLines` change; UI changes → doctor form
  migration + new Quick Practice component/wiring; Testing →
  `voice-partner-core.test.ts` additions.
- **Placeholder scan:** the one open question (legacy-specialty
  preservation-vs-reset on form save) is resolved inline in the UI changes
  section with an explicit decision (preserve raw value unless the rep
  actively re-picks), not left dangling — the plan should transcribe that
  resolution directly rather than re-opening it.
- **Consistency:** `SPECIALTIES`/`SPECIALTY_ORDER` mirrors the existing
  `STYLES`/`STYLE_ORDER` pattern exactly (same file locations, same
  `useGameData()` extension point, same EN/AR mirroring convention) so a
  future reader finds specialty data exactly where style data already
  lives.
