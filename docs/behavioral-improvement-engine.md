# Behavioral Improvement Engine

Connects three views of one rep's practice: **Conversation Snapshot** (one session vs the rep's own
history), **Behavioral Evolution** (how each metric moves), and **Personal Coaching Roadmap** (what to
drill next), plus manager assignment, follow-up and field evidence. Code: `src/lib/improvement/`.

## 1. Gap audit (what existed, what was missing)

| Capability | Already in the repo | Gap this work closes |
|---|---|---|
| Session evaluation | `session-evaluator.ts`: 9 competencies, 7 adaptation dimensions, all grounded in real turns | none, reused as is |
| Critical moments | `session-evaluator.ts` (`CriticalMoment`, quote copied from the real row) | only the count is carried into the snapshot; moments stay where they are |
| Cross-session analysis | `behavioral-gravity.ts` (trigger/response/consequence), `unused-resource-detector.ts`, `mastermind-coach.ts`, `roleplay-aggregate.ts` | each source used its own units and thresholds; `roleplay-aggregate` called a "trend" from only 2 sessions; nothing compared across sources; no "insufficient" state |
| Precision drills | `precision-drill.ts`, `drill-registry.ts`, `drill_attempts` (RLS) | drill scores were not part of any progress view |
| Manager coaching queue | `coaching-queue.ts` (flags + top Mastermind experiment) | the experiment was a label only; Mastermind explicitly **not** assignable (different taxonomy than `assignments.ts`) |
| Assignments | `assignments.ts`: one company-wide category/level task, completion = one run | no per-rep behavioural target, no baseline, no outcome check |
| Reporting | `ConversationReport`, `manager-share.ts` (opt-in) | no report that separates practice, self-reported and verified evidence |
| Self-reported vs verified | `self-vs-observed.ts` (style self-rating only); `doctor_visits.promise_done_at` (self-ticked) | **no concept of verified field outcome anywhere** |
| Customer-visit backend | `customer_visits`, `useCustomerVisitRecorder` | still no UI (unchanged, out of scope) |

Not duplicated: the engine **reuses** Mastermind insights (as roadmap items), scorecard signals, roleplay
metrics and drill attempts as inputs. It adds no new LLM call and no new scoring of conversations.

## 2. What was built

- **One metric catalogue** (`metrics.ts`): 7 metrics on a common 0-100 display scale, fixed direction
  (talk share is "lower is better"), per-metric noise floor (5 points; 0.15 steps; 10 for drills).
- **Adapters** (`sources.ts`): scorecards, roleplay summaries, drill attempts -> one `PracticeRecord`.
  Missing or non-finite values become *not measured*, never zero.
- **Snapshot** (`snapshot.ts`): each metric vs the mean of the rep's last 5 *earlier* sessions of the
  *same source*; needs 2 earlier sessions or says "no baseline". Order-independent and immune to later sessions.
- **Evolution** (`evolution.ts`): recent vs earlier window per (metric, source); under 4 sessions the answer is
  "insufficient"; 4-7 "early signal", 8+ "solid signal"; same-scenario repeats compared first vs latest.
- **Roadmap** (`roadmap.ts`): max 3 items from declining metrics and Mastermind patterns, each with one existing
  drill and a success test; thin data yields one "do N more sessions" item, never an invented focus.
- **Follow-up** (`followup.ts`, `permissions.ts`, `server.ts`, 4 API routes, migration
  `20261104130000_coaching_followups.sql`): manager assigns an item to a rep of their own company; the
  baseline is measured **on the server**; the rep acknowledges; status is judged from practice after assignment.
- **Evidence separation**: `observed_practice` (computed), `self_reported` (rep-authored), `verified_field`
  (authored by someone other than the rep). Enforced in code **and** by a DB check constraint. Reported side by
  side, never blended; `caveats` codes label thin or unverified results.
- **UI**: `MyImprovementPlan` (rep, EN + Iraqi-leaning Arabic, mounted in `GameHome`) and
  `ImprovementBoardPanel` (manager dashboard, English like the rest of the dashboard).
- **Security fix found on the way** (`20261104131000_protect_profile_authority.sql`): see section 5.

## 3. Test evidence

- New tests: 70 (`improvement.test.ts` 29, `permissions.test.ts` 12, `server.test.ts` 11, `routes.test.ts` 10,
  `MyImprovementPlan.test.tsx` 8; final run).
- Full suite after the change: 1326 passed, 2 skipped (before: 1256). `tsc --noEmit` clean. `next build --webpack` passes.
- Mutation checks: breaking the talk-ratio direction, the self-verification guard, or the company checks makes
  tests fail (4 failures across the three mutations), then restored.
- Covered: measurement consistency (shuffled input, duplicates, source isolation, direction, noise floor, scale),
  missing data (null/NaN, no baseline, under-4 sessions, empty rep), repeated sessions, recommendation
  generation (decline, Mastermind reuse, dedupe, max 3, nothing when stable), permissions (company isolation,
  self-verification, closed follow-ups, forged author), report accuracy (counts add up; verified evidence does
  not change practice or self-reported numbers).
- Scenarios used: oncology rep who stops probing under doubt (decline, assigned precision drill, recovery,
  self-report, manager confirmation); pharmacy-chain rep with a manager-verified result; brand-new rep (1-2 sessions).
- Previews (real components, real engine output, static render): `docs/improvement-engine-previews/`
  `rep-en.png`, `rep-ar.png`, `rep-thin.png`, `manager.png`.

## 4. Acceptance criteria

Completed
- Consistent metrics and stable comparison across AI Doctor, colleague roleplay and drills.
- Insufficient / uncertain evidence labelled as such everywhere (rep, manager, report).
- Roadmap with drill recommendation and a checkable success test.
- Manager assignment with server-measured baseline, acknowledgement, follow-up status, close.
- Practice vs self-reported vs verified evidence kept separate (code + DB constraint).
- EN and Arabic for the rep view; company isolation and permission tests; no new data stored beyond derived scores and 300-character notes.

Remaining / not done
- **Both migrations are not applied.** Apply `20261104131000_protect_profile_authority.sql` first, then `20261104130000_coaching_followups.sql`, in the Supabase SQL editor. Until then the new routes return errors for follow-ups and the profile hole is open.
- Not tested against a live database or a real signed-in session; screenshots are static renders, not the running app.
- Arabic strings need a native read. The manager board is English only.
- Verified field evidence is a manager's yes/no. It is not linked to a recorded customer visit and is not independent of the manager (no third party, no CRM/sales data).
- Evolution compares two windows: after a recovery it can still say "dropping" until older sessions roll out of the window (visible in the preview).
- Thresholds (5 points, 4/8 sessions, 5-session baseline) are reasoned defaults, not validated against real Iraqi pilot data.
- Critical moments are counted but not listed in the snapshot; no dialect-specific metrics yet.
- Roadmap drills point to a drill *type*, not a deep link to start it.

## 5. Security note

The original `"own profile update"` policy (migration 001) has no `WITH CHECK`, so a signed-in user could set
their own `role` and `company_id` through the Supabase client and pass every manager check in the app.
Every legitimate change (onboarding, invite, rep-join, manager-signup) uses the service-role client, and client
code only updates xp, last_visit, avatar, SPS and group. The new trigger blocks `role` / `company_id` changes from
`authenticated` / `anon` requests only. Unverified against the live database; apply and test sign-up/join after.
