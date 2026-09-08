# Specialty-Aware AI Doctor + Quick Practice Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a rep pick a curated medical specialty + social style for the AI doctor (either on the full doctor form, or via a new "Quick Practice" launcher that skips straight to it), and make that specialty actually flavor the AI's objections/questions/answers across all 5 existing voice-partner modes.

**Architecture:** A new `Specialty` enum + display-data (mirroring the existing `StyleKey`/`STYLES` pattern exactly) plus a new `SPECIALTY_CONTEXT` domain-flavor lookup (mirroring the existing `OBJECTION_INSTRUCTIONS` pattern) injected into the one shared `personaLines()` function every voice-partner mode already calls — so no per-mode route/hook/component changes are needed. On top of that, two small UI changes in `VisitPrep.tsx`: the doctor form's specialty field becomes a chip picker, and a new inline `QuickPractice` screen (same file, same pattern as the existing inline `DoctorForm`) creates a normal doctor row via the existing `saveDoctor()` path and jumps straight to its detail screen.

**Tech Stack:** Next.js (App Router), React, TypeScript, Vitest. No database migration, no new API routes.

**Spec:** `docs/superpowers/specs/2026-09-08-specialty-aware-quick-practice-design.md`

## Global Constraints

- `doctors.specialty` stays a plain `text` column and `Doctor.specialty` stays `string | null` in the TypeScript type — the `Specialty` union is a UI/prompt-layer concept only, never a DB/type-level change. No migration in this plan.
- The AI-facing prompt scaffolding (persona lines, objection instructions, domain flavor) is always written in English regardless of the app's UI language — only the model's actual spoken output is instructed to be in the target language (via `langName(lang)`, unchanged). This matches how `OBJECTION_INSTRUCTIONS` and `SYSTEM` already work — never branch `SPECIALTY_CONTEXT` or the specialty display label in `personaLines()` by `lang`.
- No invented clinical data, statistics, dosages, or real/branded drug names — `SPECIALTY_CONTEXT` entries name *domains* of concern only, never specific facts. This sits inside the existing `SYSTEM` guardrail in `voice-partner-core.ts`, which this plan does not modify.
- A doctor's stored `specialty` value that isn't one of the 8 curated keys (an old free-text value, or `null`) must degrade gracefully everywhere: no domain-flavor line is added to the prompt, and any UI display falls back to showing the raw stored string — never an error, never a blank/broken render.
- Editing an existing doctor whose `specialty` doesn't match one of the 8 curated keys, and saving the form WITHOUT touching the specialty picker, must preserve that original raw value — never silently null it out or force a re-selection.
- No test file for `QuickPractice` or the `DoctorForm` chip-picker change — matches this project's established convention that `game/*.tsx` components are untested throughout the codebase. `voice-partner-core.ts` (a pure lib file) does get new unit tests, matching its own existing convention.
- Follow the codebase's existing "one file, several small local style consts per component" convention — do not extract a shared `chip()`/`primaryBtn` helper module as part of this plan; that cross-cutting cleanup is out of scope here (each of `VoicePartnerFab.tsx`, `VoicePartnerClosing.tsx`, etc. already duplicates its own small style consts, and `DoctorForm`/`QuickPractice` follow the same file-local pattern since they live in the same file as `VisitPrep.tsx`'s own module-level `panel`/`labelStyle`/`primaryBtn`/`ghostBtn`).

---

### Task 1: `Specialty` type + `SPECIALTIES`/`SPECIALTIES_AR` display data + `useGameData()` extension

**Files:**
- Modify: `src/types/game.ts` (add `Specialty` type + `SpecialtyDef` interface, alongside `StyleKey`/`StyleDef`)
- Modify: `src/lib/game-data.ts` (add `SPECIALTIES` + `SPECIALTY_ORDER`, alongside `STYLES`/`STYLE_ORDER`)
- Modify: `src/lib/game-data-ar.ts` (add `SPECIALTIES_AR`, alongside `STYLES_AR`)
- Modify: `src/lib/i18n.tsx` (import the two new data sets, extend `useGameData()` to return them)

**Interfaces:**
- Produces: `export type Specialty = 'cardiology' | 'endocrinology' | 'oncology' | 'pediatrics' | 'general_practice' | 'dermatology' | 'respiratory' | 'psychiatry_neurology'` and `export interface SpecialtyDef { name: string; icon: string }` from `@/types/game`.
- Produces: `export const SPECIALTIES: Record<Specialty, SpecialtyDef>` and `export const SPECIALTY_ORDER: Specialty[]` from `@/lib/game-data` (EN display data — this is the set Task 2 imports directly for AI-prompt text, since prompt text is always English).
- Produces: `export const SPECIALTIES_AR: Record<Specialty, SpecialtyDef>` from `@/lib/game-data-ar` (Arabic UI display data only).
- Produces: `useGameData()` return value gains `SPECIALTIES` and `SPECIALTY_ORDER` keys (Task 4/5 will destructure these in `VisitPrep.tsx`).

- [ ] **Step 1: Add `Specialty`/`SpecialtyDef` to `types/game.ts`**

In `src/types/game.ts`, immediately after the existing `StyleKey`/`StyleDef` block (after line 11, the closing `}` of `StyleDef`), add:

```ts
export type Specialty =
  | 'cardiology' | 'endocrinology' | 'oncology' | 'pediatrics'
  | 'general_practice' | 'dermatology' | 'respiratory' | 'psychiatry_neurology'

export interface SpecialtyDef { name: string; icon: string }
```

- [ ] **Step 2: Add `SPECIALTIES`/`SPECIALTY_ORDER` to `game-data.ts`**

In `src/lib/game-data.ts`, change the import line (currently `import type { StyleDef, StyleKey, L1Item, L2Item, L3Item, L4Item, Rank, XpValues } from '@/types/game'`) to also import `Specialty` and `SpecialtyDef`:

```ts
import type { StyleDef, StyleKey, Specialty, SpecialtyDef, L1Item, L2Item, L3Item, L4Item, Rank, XpValues } from '@/types/game'
```

Then, immediately after the existing `STYLE_ORDER` line (currently line 15: `export const STYLE_ORDER: StyleKey[] = ['driver','expressive','amiable','analytical']`), add:

```ts
export const SPECIALTIES: Record<Specialty, SpecialtyDef> = {
  cardiology:           { name:'Cardiology',            icon:'♡' },
  endocrinology:        { name:'Endocrinology',         icon:'⚖' },
  oncology:             { name:'Oncology',               icon:'✚' },
  pediatrics:           { name:'Pediatrics',             icon:'★' },
  general_practice:     { name:'General Practice',       icon:'●' },
  dermatology:          { name:'Dermatology',            icon:'◐' },
  respiratory:          { name:'Respiratory',            icon:'≈' },
  psychiatry_neurology: { name:'Psychiatry & Neurology', icon:'◈' },
}

export const SPECIALTY_ORDER: Specialty[] = [
  'cardiology', 'endocrinology', 'oncology', 'pediatrics',
  'general_practice', 'dermatology', 'respiratory', 'psychiatry_neurology',
]
```

- [ ] **Step 3: Add `SPECIALTIES_AR` to `game-data-ar.ts`**

In `src/lib/game-data-ar.ts`, change the import line (currently `import type { StyleDef, StyleKey, L1Item, L2Item, L3Item, L4Item, Rank } from '@/types/game'`) to also import `Specialty` and `SpecialtyDef`:

```ts
import type { StyleDef, StyleKey, Specialty, SpecialtyDef, L1Item, L2Item, L3Item, L4Item, Rank } from '@/types/game'
```

Then, immediately after the existing `STYLES_AR` block (after line 13, its closing `}`), add:

```ts
export const SPECIALTIES_AR: Record<Specialty, SpecialtyDef> = {
  cardiology:           { name:'أمراض القلب',            icon:'♡' },
  endocrinology:        { name:'الغدد الصماء',            icon:'⚖' },
  oncology:             { name:'الأورام',                 icon:'✚' },
  pediatrics:           { name:'طب الأطفال',              icon:'★' },
  general_practice:     { name:'الطب العام',              icon:'●' },
  dermatology:          { name:'الأمراض الجلدية',         icon:'◐' },
  respiratory:          { name:'أمراض الجهاز التنفسي',    icon:'≈' },
  psychiatry_neurology: { name:'الطب النفسي والأعصاب',    icon:'◈' },
}
```

Use the Edit tool for this insertion — do not regenerate the whole file via a shell command (this file has real Arabic text and a full-file re-save can silently corrupt the encoding in this environment).

- [ ] **Step 4: Extend `useGameData()` in `i18n.tsx`**

In `src/lib/i18n.tsx`, change the import lines (currently lines 3-4):

```ts
import { STYLES, STYLE_ORDER, L1, L2, L3, L4, LEVELS, RANKS } from '@/lib/game-data'
import { STYLES_AR, L1_AR, L2_AR, L3_AR, L4_AR, LEVELS_AR, RANKS_AR } from '@/lib/game-data-ar'
```

to:

```ts
import { STYLES, STYLE_ORDER, SPECIALTIES, SPECIALTY_ORDER, L1, L2, L3, L4, LEVELS, RANKS } from '@/lib/game-data'
import { STYLES_AR, SPECIALTIES_AR, L1_AR, L2_AR, L3_AR, L4_AR, LEVELS_AR, RANKS_AR } from '@/lib/game-data-ar'
```

Then change `useGameData()` (currently lines 989-995):

```ts
export function useGameData() {
  const { lang } = useLang()
  if (lang === 'ar') {
    return { STYLES: STYLES_AR, STYLE_ORDER, L1: L1_AR, L2: L2_AR, L3: L3_AR, L4: L4_AR, LEVELS: LEVELS_AR, RANKS: RANKS_AR }
  }
  return { STYLES, STYLE_ORDER, L1, L2, L3, L4, LEVELS, RANKS }
}
```

to:

```ts
export function useGameData() {
  const { lang } = useLang()
  if (lang === 'ar') {
    return { STYLES: STYLES_AR, STYLE_ORDER, SPECIALTIES: SPECIALTIES_AR, SPECIALTY_ORDER, L1: L1_AR, L2: L2_AR, L3: L3_AR, L4: L4_AR, LEVELS: LEVELS_AR, RANKS: RANKS_AR }
  }
  return { STYLES, STYLE_ORDER, SPECIALTIES, SPECIALTY_ORDER, L1, L2, L3, L4, LEVELS, RANKS }
}
```

(`SPECIALTY_ORDER` itself is not language-specific — same array both branches, exactly like `STYLE_ORDER` today.)

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (this task only adds new exports and extends a return type — nothing consumes them yet, so no other file should need changes to keep compiling).

- [ ] **Step 6: Commit**

```bash
git add src/types/game.ts src/lib/game-data.ts src/lib/game-data-ar.ts src/lib/i18n.tsx
git commit -m "$(cat <<'EOF'
feat: add Specialty type and curated specialty display data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 2: `SPECIALTY_CONTEXT` domain-flavor lookup + `personaLines()` update

**Files:**
- Modify: `src/lib/voice-partner-core.ts` (add `SPECIALTY_CONTEXT`, `isSpecialty`; update `personaLines`)
- Modify: `src/lib/voice-partner-core.test.ts` (add tests for the above)

**Interfaces:**
- Consumes: `Specialty` type and `SPECIALTIES` (EN display data) from `@/lib/game-data`/`@/types/game` (Task 1, already complete).
- Produces: `export const SPECIALTY_CONTEXT: Record<Specialty, string>`, `export function isSpecialty(value: unknown): value is Specialty`, both from `@/lib/voice-partner-core`.
- Produces: `personaLines()` (unchanged signature) now includes a specialty domain-flavor line and renders the specialty's display label instead of its raw stored value when the value is a recognized `Specialty` key — consumed transitively by every existing voice-partner prompt builder (`buildOpeningPrompt`, `buildJudgePrompt`, `buildOpeningJudgePrompt`, `buildFabJudgePrompt`, `buildClosingJudgePrompt`, the question-drill prompts) with zero changes needed to any of those files.

- [ ] **Step 1: Write the failing tests**

In `src/lib/voice-partner-core.test.ts`, add these tests. Import `isSpecialty` and `SPECIALTY_CONTEXT` alongside the existing imports (change the import block at the top from):

```ts
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  pickObjectionType, isObjectionType, OBJECTION_TYPES,
  type VoicePartnerTurn, type ObjectionType,
} from './voice-partner-core'
```

to:

```ts
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  pickObjectionType, isObjectionType, OBJECTION_TYPES,
  isSpecialty, SPECIALTY_CONTEXT,
  type VoicePartnerTurn, type ObjectionType,
} from './voice-partner-core'
```

Then add these `describe` blocks anywhere after the existing `isObjectionType` block (after line 69):

```ts
describe('isSpecialty', () => {
  it('accepts each of the 8 curated specialty keys', () => {
    for (const key of Object.keys(SPECIALTY_CONTEXT)) expect(isSpecialty(key)).toBe(true)
  })

  it('rejects legacy free-text values, other strings, and non-strings', () => {
    expect(isSpecialty('Cardiology')).toBe(false) // display label, not the key
    expect(isSpecialty('made_up')).toBe(false)
    expect(isSpecialty(null)).toBe(false)
    expect(isSpecialty(undefined)).toBe(false)
    expect(isSpecialty(123)).toBe(false)
  })
})

describe('personaLines via buildOpeningPrompt — specialty domain-flavor', () => {
  it('includes the specialty display label and its domain-flavor text when specialty is a recognized key', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: 'cardiology' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Cardiology')
    expect(prompt).toContain('cardiovascular risk')
  })

  it('renders a different domain flavor for a different specialty', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: 'pediatrics' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Pediatrics')
    expect(prompt).toContain('dosing across different ages/weights')
  })

  it('falls back to the raw stored value with no domain-flavor line for an unrecognized legacy specialty', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: 'Cardiology' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Cardiology')
    expect(prompt).not.toContain('cardiovascular risk')
  })

  it('omits any domain-flavor line and does not error when specialty is null', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: null }), 'analytical', 'en', '', 'doubt')
    expect(prompt).not.toContain('cardiovascular risk')
    expect(prompt).not.toContain('dosing across different ages/weights')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- voice-partner-core`
Expected: FAIL — `isSpecialty`/`SPECIALTY_CONTEXT` don't exist yet, and the domain-flavor assertions don't match current `personaLines` output.

- [ ] **Step 3: Write the implementation**

In `src/lib/voice-partner-core.ts`, add this import (change the existing `import type { Doctor, StyleKey } from '@/types/game'` at line 1 to also import `Specialty`):

```ts
import type { Doctor, StyleKey, Specialty } from '@/types/game'
```

Add this import for the EN specialty display data (new line, near the existing `import { DRIVE } from '@/lib/doctor-context'` at line 2):

```ts
import { SPECIALTIES } from '@/lib/game-data'
```

Immediately after the existing `objectionInstruction` function (after line 53, its closing `}`), add:

```ts
/** Domain of plausible concern categories per specialty — steers WHICH
 * generic categories the model reaches for, never specific facts; the
 * SYSTEM guardrail's ban on invented clinical data/statistics still
 * applies in full. */
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

Then change `personaLines` (currently lines 62-69) from:

```ts
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialty = d.specialty ? `, ${d.specialty}` : ''
  const phrases = d.key_phrases?.trim() ? `They often say things like: "${d.key_phrases.trim()}".` : ''
  const objections = d.objections?.length ? `Objection theme(s) they are likely to raise: ${d.objections.join(', ')}.` : ''
  return `You are ${d.name}${specialty}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${phrases}
${objections}`
}
```

to:

```ts
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialtyLabel = d.specialty ? (isSpecialty(d.specialty) ? SPECIALTIES[d.specialty].name : d.specialty) : ''
  const specialty = specialtyLabel ? `, ${specialtyLabel}` : ''
  const domainFlavor = d.specialty && isSpecialty(d.specialty) ? SPECIALTY_CONTEXT[d.specialty] : ''
  const phrases = d.key_phrases?.trim() ? `They often say things like: "${d.key_phrases.trim()}".` : ''
  const objections = d.objections?.length ? `Objection theme(s) they are likely to raise: ${d.objections.join(', ')}.` : ''
  return `You are ${d.name}${specialty}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${domainFlavor}
${phrases}
${objections}`
}
```

(The specialty display label is always the English `SPECIALTIES` data regardless of `lang` — matching Global Constraints: AI-facing prompt scaffolding is always English.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- voice-partner-core`
Expected: PASS, including all existing tests in this file (the fallback branch for unrecognized/null specialty must not break any pre-existing assertion, e.g. the existing "includes the specialty, key phrases, and objections" test at line 84-93 which uses `specialty: 'Cardiome'` free text — recheck this still passes since `'Cardiology'` is not a recognized `Specialty` key and falls back to the raw string unchanged).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every existing test file plus the new assertions in `voice-partner-core.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice-partner-core.ts src/lib/voice-partner-core.test.ts
git commit -m "$(cat <<'EOF'
feat: add specialty domain-flavor lookup to voice-partner persona prompts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 3: i18n keys (EN + AR) for Quick Practice

**Files:**
- Modify: `src/lib/i18n.tsx` (two places — EN dictionary and AR dictionary)

**Interfaces:**
- Produces: translation keys consumed by Task 5's `QuickPractice` component.

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`, immediately after the line `'prep.backToList': '← My Doctors',` (line 246), add:

```ts
  'prep.quickPractice': '⚡ Quick Practice',
  'prep.quickPracticeTitle': 'Quick Practice',
  'prep.quickPracticeSubtitle': 'Pick a specialty and social style — no profile to fill in, just start practicing.',
  'prep.quickPracticeStart': 'Start Practicing',
```

- [ ] **Step 2: Add the AR keys**

In `src/lib/i18n.tsx`, immediately after the line `'prep.backToList': '← أطبائي',` (line 691), add:

```ts
  'prep.quickPractice': '⚡ تدرّب بسرعة',
  'prep.quickPracticeTitle': 'تدرّب بسرعة',
  'prep.quickPracticeSubtitle': 'اختر التخصص والأسلوب الاجتماعي — بلا ملف لتعبئته، ابدأ التدرّب مباشرة.',
  'prep.quickPracticeStart': 'ابدأ التدرّب',
```

Use the Edit tool for both insertions — do not regenerate the whole file via a shell command.

- [ ] **Step 3: Verify both dictionaries define the same key set**

Run: `grep -oE "^\s*'prep\.quickPractice[a-zA-Z]*'" src/lib/i18n.tsx | sort | uniq -c`

Expected: every key listed exactly twice (once per language block).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "$(cat <<'EOF'
feat: add EN+AR translations for Quick Practice launcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 4: Doctor form specialty chip picker + fix raw-specialty display

**Files:**
- Modify: `src/components/game/VisitPrep.tsx`

**Interfaces:**
- Consumes: `Specialty`, `SpecialtyDef` from `@/types/game` (Task 1); `SPECIALTIES`/`SPECIALTY_ORDER` via `useGameData()` (Task 1).
- Produces: `SPECIALTY_KEYS: Specialty[]` module-level const, consumed by Task 5's `QuickPractice` component.

- [ ] **Step 1: Add the `Specialty` import and `SPECIALTY_KEYS` const**

In `src/components/game/VisitPrep.tsx`, change the type import (currently line 10):

```ts
import type { Doctor, DoctorInput, DoctorVisit, StyleKey, GeneratedScenario } from '@/types/game'
```

to:

```ts
import type { Doctor, DoctorInput, DoctorVisit, StyleKey, Specialty, GeneratedScenario } from '@/types/game'
```

Then, immediately after the existing `STYLE_KEYS` const (currently line 28: `const STYLE_KEYS: StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']`), add:

```ts
const SPECIALTY_KEYS: Specialty[] = [
  'cardiology', 'endocrinology', 'oncology', 'pediatrics',
  'general_practice', 'dermatology', 'respiratory', 'psychiatry_neurology',
]
```

- [ ] **Step 2: Destructure `SPECIALTIES` from `useGameData()` at the top of `VisitPrep`**

Change the existing line (currently line 70):

```ts
  const { STYLES, L1, L2, L3 } = useGameData()
```

to:

```ts
  const { STYLES, SPECIALTIES, L1, L2, L3 } = useGameData()
```

- [ ] **Step 3: Fix the raw-specialty display on the doctor detail header**

Change the existing line (currently line 141):

```tsx
                <div style={{ fontSize:12.5, color:'var(--ink-dim)' }}>{[d.specialty, d.workplace].filter(Boolean).join(' · ')}</div>
```

to:

```tsx
                <div style={{ fontSize:12.5, color:'var(--ink-dim)' }}>{[d.specialty ? (SPECIALTIES[d.specialty as Specialty]?.name ?? d.specialty) : null, d.workplace].filter(Boolean).join(' · ')}</div>
```

- [ ] **Step 4: Fix the raw-specialty display on the doctor list row**

Change the existing line (currently line 255):

```tsx
                    <span style={{ fontSize:12, color:'var(--ink-dim)' }}>{[s?.name, d.specialty].filter(Boolean).join(' · ') || '—'}</span>
```

to:

```tsx
                    <span style={{ fontSize:12, color:'var(--ink-dim)' }}>{[s?.name, d.specialty ? (SPECIALTIES[d.specialty as Specialty]?.name ?? d.specialty) : null].filter(Boolean).join(' · ') || '—'}</span>
```

- [ ] **Step 5: Pass `specialties` into `DoctorForm` at its call site**

Change the existing `<DoctorForm>` call (currently lines 217-227):

```tsx
    return <DoctorForm
      doctor={view.doctor}
      styles={STYLES}
      onCancel={() => setView(view.doctor ? { mode: 'detail', doctor: view.doctor } : { mode: 'list' })}
      onSave={async (input, id) => {
        const saved = await saveDoctor(input, id)
        if (saved) setView({ mode: 'detail', doctor: saved })
        else setView({ mode: 'list' })
      }}
      onDelete={view.doctor ? async () => { await removeDoctor(view.doctor!.id); setView({ mode: 'list' }) } : undefined}
    />
```

to:

```tsx
    return <DoctorForm
      doctor={view.doctor}
      styles={STYLES}
      specialties={SPECIALTIES}
      onCancel={() => setView(view.doctor ? { mode: 'detail', doctor: view.doctor } : { mode: 'list' })}
      onSave={async (input, id) => {
        const saved = await saveDoctor(input, id)
        if (saved) setView({ mode: 'detail', doctor: saved })
        else setView({ mode: 'list' })
      }}
      onDelete={view.doctor ? async () => { await removeDoctor(view.doctor!.id); setView({ mode: 'list' }) } : undefined}
    />
```

- [ ] **Step 6: Add the `specialties` prop to `DoctorForm`'s signature**

Change the `DoctorForm` function signature (currently):

```tsx
function DoctorForm({ doctor, styles, onSave, onCancel, onDelete }: {
  doctor?: Doctor
  styles: Record<StyleKey, { name: string; icon: string }>
  onSave: (input: DoctorInput, id?: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
```

to:

```tsx
function DoctorForm({ doctor, styles, specialties, onSave, onCancel, onDelete }: {
  doctor?: Doctor
  styles: Record<StyleKey, { name: string; icon: string }>
  specialties: Record<Specialty, { name: string; icon: string }>
  onSave: (input: DoctorInput, id?: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
```

- [ ] **Step 7: Replace the specialty `<input>` with a chip picker**

Change the existing block (currently lines 311-313):

```tsx
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}><span style={labelStyle}>{t('prep.specialty')}</span><input value={specialty} onChange={e => setSpecialty(e.target.value)} style={inputStyle} /></div>
          </div>
```

to:

```tsx
          <div>
            <span style={labelStyle}>{t('prep.specialty')}</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {SPECIALTY_KEYS.map(k => (
                <button key={k} onClick={() => setSpecialty(k)} style={chip(specialty === k)}>{specialties[k].icon} {specialties[k].name}</button>
              ))}
            </div>
          </div>
```

Do NOT change the `specialty` state declaration (`const [specialty, setSpecialty] = useState(doctor?.specialty ?? '')`, currently line 277) or the `submit()` function's use of it (`specialty: specialty || null`, currently line 299) — both stay exactly as-is. This is what makes the "preserve legacy value unless the rep actively re-picks" constraint work: the chip picker's `onClick` is the only thing that ever changes `specialty`'s value; if a doctor's stored value doesn't match any of the 8 keys, no chip highlights, but the untouched original string is still what gets saved if the rep doesn't click one.

- [ ] **Step 8: Run the full suite and build**

Run: `npm test`
Expected: PASS, no regressions.

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/game/VisitPrep.tsx
git commit -m "$(cat <<'EOF'
feat: migrate doctor form specialty field to a curated chip picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 5: `QuickPractice` inline component + wiring

**Files:**
- Modify: `src/components/game/VisitPrep.tsx`

**Interfaces:**
- Consumes: `SPECIALTY_KEYS`, `STYLE_KEYS` (Task 4, already in this file); `panel`, `labelStyle`, `primaryBtn`, `ghostBtn` (existing module-level consts in this file); `SPECIALTIES`, `STYLES` via `useGameData()` (already destructured at the top of `VisitPrep` after Task 4).
- Produces: a `'quickPractice'` `View` mode reachable from the doctor list screen; on completion, a new normal doctor row via the existing `saveDoctor()` path, landing on its `'detail'` screen exactly like the full doctor form does.

- [ ] **Step 1: Add the `View` variant**

In `src/components/game/VisitPrep.tsx`, change the `View` union (currently):

```ts
type View =
  | { mode: 'list' }
  | { mode: 'form'; doctor?: Doctor }
  | { mode: 'detail'; doctor: Doctor }
```

to:

```ts
type View =
  | { mode: 'list' }
  | { mode: 'form'; doctor?: Doctor }
  | { mode: 'quickPractice' }
  | { mode: 'detail'; doctor: Doctor }
```

(The remaining variants — `warmup`, `ai`, `logVisit`, `roleplay`, `voice`, `voiceOpening`, `questionDrill`, `voiceFab`, `voiceClosing` — are unchanged; only inserting the new one after `form`.)

- [ ] **Step 2: Add the render branch**

Immediately after the existing `'form'` branch (after its closing `}`, currently ending at line 228, right before the `// ───────────────────────── LIST ─────────────────────────` comment), add:

```tsx
  // ───────────────────────── QUICK PRACTICE ─────────────────────────
  if (view.mode === 'quickPractice') {
    return <QuickPractice
      specialties={SPECIALTIES}
      styles={STYLES}
      existingNames={doctors.map(d => d.name)}
      onCancel={() => setView({ mode: 'list' })}
      onStart={async (input) => {
        const saved = await saveDoctor(input)
        if (saved) setView({ mode: 'detail', doctor: saved })
        else setView({ mode: 'list' })
      }}
    />
  }
```

(The `saveDoctor` failure path — falling back to `'list'` with no inline error message — matches the existing `DoctorForm`'s `onSave` handler exactly, which has the identical fallback for the same failure case.)

- [ ] **Step 3: Add the entry button on the doctor list screen**

Immediately after the existing "Add a doctor" button (currently line 239: `<button onClick={() => setView({ mode: 'form' })} style={{ ...primaryBtn, width:'100%' }}>{t('prep.addDoctor')}</button>`), add:

```tsx
          <button onClick={() => setView({ mode: 'quickPractice' })} style={{ ...ghostBtn, width:'100%', marginTop:8 }}>{t('prep.quickPractice')}</button>
```

- [ ] **Step 4: Add the `QuickPractice` component**

Immediately after the existing `DoctorForm` function's closing `}` (currently line 380, right before the `// ───────────────────────── Warm-up player ─────────────────────────` comment), add:

```tsx
// ───────────────────────── Quick Practice launcher ─────────────────────────
function QuickPractice({ specialties, styles, existingNames, onStart, onCancel }: {
  specialties: Record<Specialty, { name: string; icon: string }>
  styles: Record<StyleKey, { name: string; icon: string }>
  existingNames: string[]
  onStart: (input: DoctorInput) => void
  onCancel: () => void
}) {
  const t = useT()
  const [specialty, setSpecialty] = useState<Specialty | null>(null)
  const [style, setStyle] = useState<StyleKey | null>(null)

  const chip = (active: boolean): React.CSSProperties => ({
    cursor:'pointer', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.05em', borderRadius:20, padding:'8px 12px',
    border:`1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, color: active ? 'var(--cyan)' : 'var(--ink-dim)',
    background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction:'manipulation',
  })

  function start() {
    if (!specialty || !style) return
    const base = `${specialties[specialty].name} Practice`
    let name = base
    let n = 2
    while (existingNames.includes(name)) { name = `${base} ${n}`; n++ }
    onStart({
      name, specialty, workplace: null, style,
      assertiveness: null, responsiveness: null,
      key_phrases: null, objections: [], objection_notes: null, notes: null,
    })
  }

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14 }}>
      {panel(t('prep.quickPracticeTitle'),
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ color:'var(--ink-dim)', fontSize:12.5, lineHeight:1.5 }}>{t('prep.quickPracticeSubtitle')}</div>
          <div>
            <span style={labelStyle}>{t('prep.specialty')}</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {SPECIALTY_KEYS.map(k => (
                <button key={k} onClick={() => setSpecialty(k)} style={chip(specialty === k)}>{specialties[k].icon} {specialties[k].name}</button>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>{t('prep.style')}</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {STYLE_KEYS.map(k => (
                <button key={k} onClick={() => setStyle(k)} style={chip(style === k)}>{styles[k].icon} {styles[k].name}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={start} disabled={!specialty || !style} style={{ ...primaryBtn, flex:1, opacity: (specialty && style) ? 1 : .5 }}>{t('prep.quickPracticeStart')}</button>
            <button onClick={onCancel} style={ghostBtn}>{t('prep.cancel')}</button>
          </div>
        </div>,
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the full suite and build**

Run: `npm test`
Expected: PASS, no regressions.

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. This is the step that would catch a non-exhaustive `View` union check or a missing import.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/VisitPrep.tsx
git commit -m "$(cat <<'EOF'
feat: add Quick Practice launcher for specialty+style-only doctor creation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AGwhSzqq3cL1yWh5ZazR6x
EOF
)"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: PASS — every existing test plus the new `voice-partner-core.test.ts` assertions from Task 2.

- [ ] **Step 2: Run a full production build to type-check the whole app**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: If either step fails, fix and re-run before considering the plan complete**

No commit for this task — it's a gate, not a deliverable.

---

## Self-Review Notes

- **Spec coverage:** Data model → Task 1 (types/display data) + Task 2 (domain-flavor lookup + `personaLines`); UI changes → Task 3 (i18n) + Task 4 (form migration + display fixes) + Task 5 (launcher); Testing → Task 2's test additions + Task 6's full-suite gate.
- **Placeholder scan:** no TBDs; every step has literal code. The one open question the spec flagged (legacy-specialty preserve-vs-reset on form save) is resolved concretely in Task 4 Step 7's note — the chip picker never touches `specialty` state except on click, so untouched legacy values are preserved by construction, not by any extra logic.
- **Type consistency:** `Specialty`/`SpecialtyDef` (Task 1) are the same identifiers used verbatim in Tasks 2, 4, and 5. `SPECIALTY_KEYS` (Task 4) is defined once and reused by both `DoctorForm` (Task 4) and `QuickPractice` (Task 5) without duplication. `SPECIALTY_CONTEXT`/`isSpecialty` (Task 2) are used only inside `voice-partner-core.ts`'s `personaLines` — no other file needs to import them, since every mode's prompt builder already calls `personaLines` transitively.
- **No route/hook/component changes needed for any of the 5 existing voice-partner modes** — confirmed by tracing: all 5 modes' prompt builders (`buildOpeningPrompt`, `buildJudgePrompt`, `buildOpeningJudgePrompt`, `buildFabJudgePrompt`, `buildClosingJudgePrompt`, and the question-drill prompts in `voice-partner-questioning.ts`) call `personaLines()` (or an equivalent that itself calls it) as their first line — this is the single leverage point the whole plan relies on, and Task 2 is the only place that function's behavior changes.
- **Deviation from spec:** the spec's UI Changes section named the new component `QuickPractice.tsx` as if it were a separate file (matching the `VoicePartnerFab.tsx`-style sibling modes). On inspecting the actual codebase during plan-writing, `DoctorForm` — the closest analog to what `QuickPractice` does (create a doctor with a reduced field set) — is defined as a local function INSIDE `VisitPrep.tsx`, sharing that file's module-level `panel`/`labelStyle`/`primaryBtn`/`ghostBtn` consts. Task 5 places `QuickPractice` the same way (inline in `VisitPrep.tsx`, next to `DoctorForm`) rather than as a new separate file, avoiding duplicating those four style helpers into a new file for no benefit. This is a plan-level refinement of the spec's suggested file layout, not a behavior change — flagged here per the spec's own instruction to record deviations.
