# Assessor rating workflow

The screen and API an assessor uses to rate pilot cases against rubric `hrr-1.0.0`. It is off until the owner turns it on.

## What it does

- `/validation/rate` lists the cases assigned to the signed-in assessor (case number, scenario type A to D, and their own status: not started, draft, submitted). It shows no rep, no phase, no earlier-attempt flag and no other assessor's work.
- Opening a case shows the conversation turn by turn, numbered from 0, and the nine domains. For each: a score 1 to 5 or NO (not observable), the turn numbers that show it, an optional note (300 characters) and an "unsure" flag.
- **Save draft** stores what was answered. **Submit** asks for confirmation, then locks the rating for good.
- A case can be marked unscorable, which needs no domain answers.

API: `GET /api/validation/assessor/cases`, `GET` and `PUT /api/validation/assessor/cases/{id}` (body `{ unscorable, items, submit }`).

## Rules enforced

| Rule | Enforced by |
|---|---|
| Only the assigned assessor reads or writes a case; nobody sees another assessor's rating | Database policies (the routes run every read and write as the signed-in assessor), plus an assignment check in the service |
| A score is 1 to 5, or NO with no score; an observable domain cites at least one turn | Service validation and database checks |
| A 5 cites at least two turns (rubric section 1) | Service validation only |
| A cited turn must exist in the case | Service validation |
| A submission answers all nine domains, unless the case is unscorable | Service validation |
| A submitted rating, and its items, never change | Database triggers and policies; the service also refuses first |
| Writes only while the pilot is running and the assessor is still a member | Database policies; the route turns the refusal into a plain 403 |
| Database error text never reaches the browser | `respond()` in `assessor-route.ts` |

`src/test/db/assessorWorkflow.test.ts` replays the store's exact statements, in order, as an assessor against the real policies and triggers.

## Turning it on

1. Owner approves and applies `supabase/migrations/20261106140000_validation_pilot.sql` (not applied yet).
2. Set `VALIDATION_PILOT_ENABLED=true` on the site. Until then the routes return 404 and the page redirects.
3. A pilot, its members and its cases must exist. **There is no administrator screen yet**; they are created with SQL. That screen is the next piece.

## Known limits

- **Only AI-doctor sessions have a transcript here.** Cases built on human-partner calls report "no transcript yet" instead of showing anything. They need their own transcript view.
- **Free text is not de-identified.** The transcript is shown as spoken; if a rep or a doctor says a name, the assessor sees it. De-identification of the text is a pilot-design decision, not done here.
- **English only.** Labels and instructions are English; the conversations themselves display in their own language.
- **Saving a draft is several requests, not one transaction.** If the connection drops mid-save, the stored draft can be incomplete; the screen still holds what was typed, so saving again repairs it.
- **Not yet exercised against a live Supabase project**, because the tables do not exist there. The database behavior is tested in a real Postgres (PGlite); the Supabase client calls are covered by unit tests with a fake store.
