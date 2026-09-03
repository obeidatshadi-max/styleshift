# Perform Pillar: Colleague Roster + Live Roleplay History — Design

## Purpose

StyleShift's IA is Train / Rehearse / Perform. Rehearse is pre-call
preparation for a specific real doctor (cheat sheet, warm-up drills, AI
bespoke drill, and — already shipped — a single one-off colleague
roleplay session per doctor, scored on talk ratio, question ratio,
open-question ratio, paraphrase score, and active listening).

What's missing: repetition and a practice-partner identity independent
of any one doctor. A rep doesn't rehearse once — they run the same
call structure (pre-call open, objection handling, close) many times,
often with different colleagues playing different doctor personalities,
and the value is in seeing whether the numbers improve session over
session. Today a roleplay session's scores are shown once on the result
screen and then never seen again — there is no history.

Perform is that repetition surface: a roster of named practice
colleagues, and for each one, an accumulating history of live roleplay
sessions with their coaching scores, so a rep can watch their open-Q
ratio or active-listening score trend upward across attempts with the
same partner.

**Out of scope for this spec:** AI-simulated solo practice (rep alone,
in the car or at home, roleplaying against an AI voice that plays a
doctor persona from saved profile details). That is a materially
bigger build — a real-time voice AI loop, not a data-model extension —
and is intentionally deferred to its own future design. This spec adds
nothing that would block it: the AI-solo mode would insert sessions
into the same `roleplay_sessions` history with `colleague_id` and
`doctor_id` both null (or a new `source` discriminator), which the
history UI already renders generically.

## Data model

Single migration, `supabase/migrations/013_colleagues.sql`, containing
both DDL blocks below in order (table must exist before the FK that
references it).

### New table: `colleagues`

Mirrors `doctors` but deliberately minimal — a colleague isn't a
prep target with a style/objection profile, just a named practice
partner:

```sql
create table public.colleagues (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.colleagues enable row level security;
create policy "own colleagues read" on public.colleagues for select using (rep_id = auth.uid());
create policy "own colleagues insert" on public.colleagues for insert with check (rep_id = auth.uid());
create policy "own colleagues delete" on public.colleagues for delete using (rep_id = auth.uid());
```

No update policy — renaming isn't a requirement for this increment
(YAGNI; add later if asked). No manager-read policy — colleagues are a
rep's private practice roster, not something a manager needs to see
(unlike roleplay *sessions*, which managers already read via the
existing `roleplay_sessions` policy).

### `roleplay_sessions`: add `colleague_id`

```sql
alter table public.roleplay_sessions
  add column colleague_id uuid references public.colleagues(id) on delete set null;

drop policy "own roleplay sessions insert" on public.roleplay_sessions;
create policy "own roleplay sessions insert" on public.roleplay_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
  and (colleague_id is null or colleague_id in (select id from public.colleagues where rep_id = auth.uid()))
);
```

Same ownership-scoping shape as the existing `doctor_id` check (migration
010) — a rep can't attach another rep's colleague to their session.
`doctor_id` and `colleague_id` are independent nullable FKs; a session
may carry either, both, or neither (e.g. today's doctor-scoped roleplay
keeps working unchanged with `colleague_id` null).

This is the only schema change needed to unlock history: nothing reads
`roleplay_sessions` today (it's write-only from `useRoleplayRecorder`),
so no existing query is affected.

## Hooks

- **`useColleagues()`** — verbatim copy of `useDoctors()`'s shape
  (`{ colleagues, loading, saveColleague, removeColleague, reload }`),
  against the `colleagues` table, with `ColleagueInput = { name: string }`.
- **`useColleagueSessions(colleagueId)`** — new. Reads
  `roleplay_sessions` filtered by `colleague_id`, ordered by
  `created_at desc`, selecting the columns the history row needs
  (`id, created_at, duration_sec, talk_ratio, question_ratio,
  open_question_ratio, paraphrase_score, active_listening_score,
  rep_style, rep_confidence`). No `addSession` — inserts stay owned by
  `useRoleplayRecorder`.

## Components

- **`RoleplayRecorder`**: add `colleagueId: string | null` prop
  alongside the existing `doctorId: string | null`. `useRoleplayRecorder`
  takes both and inserts both FK columns. No scoring logic changes —
  both ids are pass-through tags, exactly like `doctorId` is today.
- **New `Colleagues.tsx`** (Perform tab content, mirrors `VisitPrep.tsx`'s
  list/detail shape but far shorter — no form fields beyond name, no
  style/objections/AI-drill/warm-up):
  - **List view**: add-colleague (name only) + tappable roster.
  - **Detail view**: session history (date, talk/question/open-Q/paraphrase
    %, active-listening score+label — same numbers and same i18n keys
    `roleplay.*` already used on the result screen, just rendered as
    compact rows instead of full bars) + a "Start Live Roleplay" button
    that opens `RoleplayRecorder` with this colleague's id.
- **`GameShell`**: new `screen: 'perform'`, wired from `GameHome`'s
  Perform tab exactly like the existing `'prep'` screen wires from the
  Rehearse tab's reopen button.

## i18n

New keys only for what has no equivalent yet: `perform.addColleague`,
`perform.myColleagues`, `perform.name`, `perform.empty`,
`perform.startRoleplay`, `perform.historyTitle`, `perform.historyEmpty`,
`perform.backToList`. All coaching-metric labels/hints reuse the
existing `roleplay.*` keys — no new metric copy, no new consent copy
(the existing `roleplay.consentBody` already says "you and your
practice partner," which was already colleague-agnostic).

## Testing

`colleague-core.ts`-style pure logic doesn't apply here — this is CRUD
plus a filtered read, not a scoring algorithm. No new Vitest file. Existing
`roleplay-core.test.ts` is untouched since no scoring path changes.
Verification is TypeScript (`tsc --noEmit`) + manual browser click-through
(add colleague → run a roleplay → confirm it appears in that colleague's
history with correct scores) before calling this done.

## Explicitly not built here

- AI-simulated solo practice (see Purpose, above) — separate future spec.
- Colleague rename/edit — add if requested.
- Manager visibility into a rep's colleague roster — colleagues are
  private; manager visibility into roleplay *scores* already exists.
