# Assignments + Team Pulse — Design

Date: 2026-06-12
Status: approved (P1 + P2 from StyleShift priority review)

## Goal

P1 — managers assign targeted practice (objection category or level) to reps; reps
see and complete it in-game; managers see completion.
P2 — anti-decay: dashboard "Team Pulse" panel computes streaks-at-risk, inactive
reps, and a weekly digest, with one-tap WhatsApp share (copy-paste channel — no
email/push infrastructure).

## Decisions made with user

- **Channel:** WhatsApp copy-paste. App generates digest + streak-nudge text;
  manager shares to team group. No external services, no cron.
- **Assignment scope:** simple — one target per assignment (objection category OR
  level), all reps or selected, due in 7 days, one active assignment per company.
  Completion is binary per rep: finish one qualifying run.

## Schema (migration 005)

- `assignments`: id, company_id, created_by, target_type ('category'|'level'),
  target_key (e.g. 'price' or '3'), rep_ids uuid[] (null = all reps), due_date
  (default today+7), active boolean, created_at. Creating a new assignment
  deactivates the previous one (app-enforced).
- `assignment_progress`: assignment_id, rep_id, completed_at, PK(assignment_id, rep_id).
- RLS enabled; reads/writes go through API routes using the admin client with
  role checks (same pattern as team-stats / standings).

## Components

- `src/lib/assignments.ts` — server lib: get active assignment for a rep (with own
  progress), get assignment + per-rep progress for a manager, create (deactivates
  old), mark complete. Admin client.
- `src/app/api/assignments/route.ts` — GET (rep view), POST (manager create),
  PATCH (rep completes). Auth via server client; data via lib.
- `src/lib/team-pulse.ts` — computes on dashboard load (no cron): streaks at risk
  today (active streak, daily set unfinished), inactive 3+ days (last_visit),
  weekly digest data (sessions last 7 days, top rep, weakest level, assignment
  completion). Reuses `getDailyLeaderboard` + `getTeamStatsForUser`.
- `src/components/dashboard/AssignPanel.tsx` (client) — pick category (7) or level
  (4), pick reps, create; shows active assignment + per-rep ✓/✗ and due date.
- `src/components/dashboard/TeamPulse.tsx` (client) — at-risk + inactive lists;
  two share buttons (streak nudge, weekly digest) with EN/AR text toggle;
  `navigator.share` on mobile, clipboard fallback.
- `GameShell` — loads `/api/assignments`; new screen `assignment`: category type
  plays a set of up to 3 matching Level-2 scenarios via `DailyChallenge` (same
  pattern as VisitPrep warm-up, filtered by `L2_OBJECTION`); level type routes to
  the normal level and `handleLevelComplete` marks the assignment done when the
  level matches. Completion → PATCH + small XP bonus.
- `GameHome` — assignment banner (target, due date, done state); streak-risk line
  in the Daily panel when streak ≥ 2 and today unfinished.
- i18n — new EN/AR keys for banner + drill titles. Dashboard stays English
  (matches existing hardcoded dashboard); digest text is bilingual inside TeamPulse.

## Error handling

- Past-due assignment → banner shows overdue (red on dashboard).
- No active assignment → no banner, no panel rows.
- Category with <3 scenarios (e.g. price has 2) → set uses what exists.
- `navigator.share` unavailable → clipboard + "Copied" toast.
- API failures → panels render without data (matches existing fetch-and-ignore pattern).

## Out of scope (YAGNI)

Push/email, multiple concurrent assignments, auto-suggested assignments,
rep-side digest, drill counts beyond one run.

## Testing

Manual flows (assign → rep sees banner → completes → dashboard shows ✓;
streak-risk shows/hides around daily completion; share buttons) + `npm run build`
passes. Repo has no test framework — staying consistent.
