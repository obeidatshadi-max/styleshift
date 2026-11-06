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
| A 5 cites at least two turns (rubric section 1) | Service validation and a database check |
| A cited turn must exist in the case | Service validation only (the database does not know a case's turns) |
| A submission answers all nine domains, unless the case is unscorable | Service validation and a database trigger, so a direct call cannot submit a partial rating |
| Access to a case (and its transcript) ends when the pilot is closed or the assessor is removed from it | The database policy on assigned cases; the server only shows a transcript for a case that policy returns |
| A submitted rating, and its items, never change | Database triggers and policies; the service also refuses first |
| Writes only while the pilot is running and the assessor is still a member | Database policies; the route turns the refusal into a plain 403 |
| Database error text never reaches the browser | `respond()` in `assessor-route.ts` |

`src/test/db/assessorWorkflow.test.ts` replays the store's exact statements, in order, as an assessor against the real policies and triggers.

## Turning it on

1. Owner approves and applies `supabase/migrations/20261106140000_validation_pilot.sql` (not applied yet).
2. Set `VALIDATION_PILOT_ENABLED=true` on the site. Until then the routes return 404 and the page redirects.
3. A manager creates the pilot and its cases on `/validation/admin` (below).

## Pilot administration (`/validation/admin`)

A manager creates a pilot for their own company and becomes its administrator. The administrator then:

- adds people from the company as assessors, adjudicators or (other) administrators;
- adds cases while the pilot is a draft: a representative of the company, one of that representative's real sessions (AI-doctor session or colleague practice call), the scenario type and version, the phase, whether the scenario was seen before, and two to five assessors;
- starts the pilot (cases can no longer be added; assessors then see their cases), and later closes it (ratings stop; it cannot reopen).

Rules the service enforces: the pilot, its members and cases are written only by the server, after checking that the caller administers that pilot; a case needs at least two assessors who are pilot assessors; nobody rates their own conversation, and a representative of the pilot cannot become an assessor; an administrator cannot also be an assessor (also enforced by the database); a pilot starts only with at least one case and two assessors on every case; status moves draft, running, closed and never back. A manager assessing a representative of their own company is allowed but flagged with a warning.

API: `GET`/`POST /api/validation/admin/pilots`, `GET /api/validation/admin/pilots/{id}`, `POST` on `.../members`, `.../cases` and `.../status`. `src/test/db/pilotAdmin.test.ts` replays the store's statements against the real tables.

Not yet: picking a session from a list (the id is typed), scenario assignment and the Latin-square order from the protocol, removing a member or a case, calibration records, and assessors from outside the company.

## Known limits

- **Cited turns are checked by the API only**, and the transcript is not frozen when a case is assigned. Turns are read live from the conversation record, scoped to the case's own rep and session; a case with duplicate turn numbers is not shown. A direct database call could cite a turn number that does not exist.
- **Only AI-doctor sessions have a transcript here.** Cases built on human-partner calls report "no transcript yet" instead of showing anything. They need their own transcript view.
- **Free text is not de-identified.** The transcript is shown as spoken; if a rep or a doctor says a name, the assessor sees it. De-identification of the text is a pilot-design decision, not done here.
- **English only.** Labels and instructions are English; the conversations themselves display in their own language.
- **Saving a draft is several requests, not one transaction.** If the connection drops mid-save, the stored draft can be incomplete; the screen still holds what was typed, so saving again repairs it.
- **Not yet exercised against a live Supabase project**, because the tables do not exist there. The database behavior is tested in a real Postgres (PGlite); the Supabase client calls are covered by unit tests with a fake store.
