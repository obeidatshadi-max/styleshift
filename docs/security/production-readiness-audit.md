# StyleShift: production security and migration audit (Phase A)

Audited 2026-11-06 against `main` at `e14d84d`. This document says what was verified, how, and what was not.

## Verdict: CONDITIONAL

- No critical security finding. One high-severity **operational** finding (schema drift, F1) is only partly repaired in code.
- Three medium or low security findings are **confirmed in production** and fixed in code (migration `20261106120000_security_hardening.sql`, one app change). **That migration has not been applied to production.** It needs your approval.
- Production was read only through the Supabase dashboard (SELECT queries on the catalog). Nothing in production was changed.
- Not verified: Supabase Auth settings, Netlify environment variables and which commit is deployed, and any behaviour that needs a real signed-in session against production.

## How production was checked

Read-only SELECT queries in the Supabase SQL editor on project `cnlloaihrrmattuidpeh`, signed in as the project owner. The exact queries are in "Repeat the production checks" below. They read the catalog (`pg_policies`, `pg_proc`, `pg_class`, `information_schema`, `supabase_migrations.schema_migrations`) and return no row data. Side effect: the SQL editor kept one "Untitled query" snippet in your private list; it can be deleted.

Database behaviour was tested on a real Postgres (PGlite) with every migration file loaded, as a signed-in user, an anonymous visitor and the service role. PGlite is not Supabase. Three tables are stand-ins (see F1), so those tests prove nothing about the stand-ins beyond the migrations that touch them.

## Findings

| # | Finding | Severity | In production? | Status |
|---|---|---|---|---|
| F1 | Migration files do not reproduce production (schema drift) | High (operational) | Yes, verified | Partly repaired |
| F2 | A rep can write progress and replies against another company's assignment | Medium | Yes, verified | Fixed in migration, not applied |
| F3 | A manager can read every rep's raw voice-practice transcript text | Medium (privacy) | Yes, verified | Fixed in migration, not applied |
| F4 | AssemblyAI deletion is attempted once, silently, and never confirmed | Medium (privacy) | Yes (code) | Fixed in app code |
| F5 | A rep can set their own `group_id` (join any group without its code) | Low | Yes, verified | Fixed in migration, not applied |
| F6 | XP is written by the browser, so any rep can set their own | Low | Yes (by design) | Documented, not changed |
| F7 | `anon` holds default privileges on 40 tables; row security is the only gate | Informational | Yes, verified | Documented, not changed |
| F8 | Migration history is incomplete and uses different names; two files share version 030 | Informational | Yes, verified | Documented |

### F1. Migration files do not reproduce production

Verified facts:
- `doctors`, `doctor_visits` and `daily_challenges` are used by many migrations but **no migration creates them**. They were made in the SQL editor.
- Production's `profiles` read policy uses two helper functions, `auth_is_manager()` and `auth_company_id()`, that no file creates (production history: `fix_rls_recursion`). Built from the files alone, **any signed-in query on `profiles` fails with "infinite recursion in policy"**.
- Production has an own-row UPDATE policy on `roleplay_sessions` (history: `roleplay_sessions_own_update_policy`) that no file contains. The files' `companies` insert policy (`WITH CHECK (true)`) does not exist in production.
- Production history names (for example `add_doctors`, `fix_rls_recursion`) do not match the file names, and seven files are not recorded at all (see F8).

Consequences: a staging or CI database cannot be built from the repo; tests built from the files do not describe production; the next person to rebuild the project would get a broken or weaker schema.

Done: the hardening migration creates the two helpers only if missing (production's own versions are never replaced), restores the safe profiles policy, drops the unused companies insert policy and adds the roleplay update policy, so files plus that migration match production on these points. The test harness loads all 54 migrations plus clearly labelled stand-ins.

Not done, needs a decision: take a baseline snapshot of production's schema (`supabase db pull`) and commit it, so `doctors`, `doctor_visits`, `daily_challenges` and every other drifted object are captured exactly. Until then, treat production as the source of truth and re-run the catalog queries below after any change.

### F2. Cross-company writes to assignment progress and replies

The insert policies on `assignment_progress` and `assignment_replies` check only `rep_id = auth.uid()` (production policy text verified). A signed-in rep who knows another company's assignment id can insert rows against it, and they appear on that company's manager board. Needs a v4 UUID, so exploitability is low; the effect is wrong data on another tenant's board. Reproduced on a real database; fixed by requiring the assignment to belong to the rep's company.

### F3. Managers can read raw voice-practice transcripts

`manager conversation turns read` on `conversation_turns` lets any manager query every rep's turn text in their company directly (production policy verified; reproduced). The sharing model (PR #61) makes private practice opt-in: text simulations and coach debriefs are owner-only and verified so in tests. Voice-practice turns were not. No code reads them as a manager, so dropping the policy changes no screen.

### F4. Recording deletion was only ever "attempted"

The browser asked AssemblyAI to delete a transcript once, threw the answer away, never retried, and never deleted a transcript whose job failed. The proxy does report `{ deleted: boolean }`.

Fixed in app code: deletion now counts only when the provider answers `deleted: true` ("acknowledged"); it is retried once at once; a deletion that is not acknowledged is remembered (id only, in the browser) and retried at the next analysis, up to four tries in total; a failed job's remote copy is also deleted. "Verified" (checking afterwards that it is gone) is **not** implemented, so no code claims it. If the browser's storage is unavailable, or all tries fail, the provider's own limits apply (audio 24 to 48 hours, transcript 30 days, per its documentation; not independently confirmed here). A server-side reconciliation job would be the stronger fix and needs a place to store transcript ids.

### F5. `profiles.group_id` was self-editable

The authority trigger protected `role` and `company_id` only. A signed-in user could set `group_id` and join a group without its invite code (needs the group's UUID). Groups are meant to be joined by code through `/api/groups`, which uses the service role. The trigger now protects `group_id` as well.

### F6. XP is client-written

`profiles.xp` is updated from the browser by design, so a rep can give themselves any XP. Nothing security-relevant depends on it (certificates use practice evidence). Recommended: write XP on the server from `xp_events`. Not changed.

### F7. Anonymous privileges

`anon` holds default privileges on 40 StyleShift tables. Row security blocks every case tested (anonymous reads return nothing; no anonymous writes). Revoking `anon` on tables with no anonymous use would be defence in depth, but each table needs an app check first. Not changed.

### F8. Migration history

Last recorded: `20261101114432 arena_teams_locked`. Not recorded, although their objects exist in production: `share_with_manager`, `coaching_followups`, `protect_profile_authority`, `key_messages`, `ihia_proposals`, `certification_audit`, `ihia_proposals_lock_down` (applied by pasting SQL). So "not in history" does **not** mean "not applied": the catalog is the evidence. Two files share the version `030` (`030_ai_doctor_realtime_timing.sql` and `030_voice_partner_live_source.sql`); the Supabase CLI keys history on the version number, so these cannot both be recorded by `supabase db push`.

## What was checked and held

Verified in production unless marked (test):
- Row level security is on for every table in `public`.
- The `profiles_protect_authority` trigger is live, so a signed-in user cannot change their own `role` or `company_id` (test: refused for reps, for managers acting on reps, and for new sign-ups).
- A rep cannot write "verified" field evidence about themselves, and not even a manager can write field evidence straight to the table; the server also cannot make a rep the author of a verified check (test).
- `audit_events` cannot be updated or deleted, even by the service role; the triggers are live.
- `agent_sessions` and `coach_debriefs` are owner-only, so unshared items are invisible to managers (test).
- The `ihia_proposals` lock-down is applied: only the insert policy remains.
- Cross-company reads of profiles, sessions, practice rows and follow-ups return nothing (test).
- A rep cannot read teammates' game sessions. The production policy looks broad (company membership only) but is safe, because its subquery on `profiles` is itself filtered by row security. A first reading of it as a flaw was wrong; a test keeps it checked.
- The admin client is imported by no browser code; the service-role key is read in two server files; no secret-like variable is public; `.env.example` holds no values (tests in `src/test/security/boundaries.test.ts`).
- Merging to `main` cannot change production's database: the Supabase GitHub integration is not connected (dashboard, Settings, Integrations: "No connections yet"), and neither the repo's workflows nor `netlify.toml` run any migration command.
- Server routes that use the admin client each authenticate: user session, signed bot token, class code, cron secret, or public sign-up with rate limits. Follow-up and field-check routes use pure permission rules plus database constraints.

## Not verified

- Supabase Auth settings (token lifetime, confirmation, rate limits, the anonymous sign-in switch) and Netlify settings.
- Which commit production serves. The `/reset-link` page was seen live after merge, which shows a recent deploy, not the exact commit.
- Any behaviour with a real signed-in session against production. Policies were read, not exercised.
- Health360 tables share this project and the same login users. They were not audited here. A flaw there, or a leak of the service-role key, would reach StyleShift data. Recommended: audit it separately.

## Changes in this PR

- `supabase/migrations/20261106120000_security_hardening.sql` (idempotent; **not applied to production**).
- `src/lib/assemblyai-client.ts`: acknowledged, retried, remembered deletion; failed jobs also deleted.
- `src/test/db/` real-Postgres test harness and 45 security tests; the same attacks are run against "production as it is today" and shown to succeed there, then to be refused after the migration.
- `src/test/security/boundaries.test.ts`: four repo guards.
- `package.json`: `@electric-sql/pglite` 0.2.17 as a dev dependency.

## Required approvals and next steps

1. Approve applying `20261106120000_security_hardening.sql` to production, after reading the file. It touches no data, is idempotent, and its rollback is to re-create the named policies. Apply it in the SQL editor, then run the checks below.
2. Decide on a committed baseline snapshot of the production schema (F1).
3. Decide whether to build server-side reconciliation of provider deletions (F4) and server-side XP (F6).

## Repeat the production checks (read-only)

```sql
-- migration history
select string_agg(version || ' ' || name, ' ; ' order by version) from supabase_migrations.schema_migrations;
-- row security and functions
select string_agg(relname || ':' || relrowsecurity::text, ' ; ' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';
select string_agg(proname || ':' || prosecdef::text, ' ; ' order by proname) from pg_proc where pronamespace = 'public'::regnamespace;
-- policies (run twice: tablename < 'k' and tablename >= 'k')
select string_agg(tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || roles::text || ' | Q: ' || coalesce(qual, '-') || ' | C: ' || coalesce(with_check, '-'), ' ## ' order by tablename, policyname)
from pg_policies where schemaname = 'public' and tablename not like 'health360%' and tablename < 'k';
```

After applying the hardening migration, expect: no `manager conversation turns read` on `conversation_turns`; `own progress insert` and `own replies insert` mention `assignments`; `protect_profile_authority` mentions `group_id` (`select prosrc from pg_proc where proname = 'protect_profile_authority'`); `own roleplay sessions update` present on `roleplay_sessions`. Then sign in as a rep and a manager and confirm the manager dashboard, assignments, and practice history still load.

## Running the tests

`npm test` runs everything, including the database tests (about 20 seconds). Only `src/test/db/` needs the dev dependency. To prove the tests can fail, they also run against "production as it is today" (the hardening migration skipped) and assert that F2, F3 and F5 succeed there.
