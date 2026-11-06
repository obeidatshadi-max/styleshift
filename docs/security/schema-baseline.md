# Production schema baseline and migration history

Captured read-only on 2026-11-06 from the production Supabase project. Nothing in production was changed.

## What was done

1. **Fingerprinted both sides with the same SQL.** `src/test/db/catalogFingerprint.ts` hashes, for every table in `public`, its columns, constraints, indexes, policies and triggers, and for every function its arguments, security-definer flag, volatility, settings and whitespace-normalised body. The SQL runs on a database built from `supabase/migrations` and, in the SQL editor, on production. Health360 tables (another app in the same project), the validation tables (not yet applied) and data are out of scope.
2. **Closed the gap the files had.** `doctors`, `doctor_visits` and `daily_challenges` existed in production but no file created them; the tests used hand-written stand-ins. `supabase/migrations/003a_production_baseline_gap.sql` now creates them exactly as production has them. It sorts after 001 (creates `profiles`) and before 004 (first file that touches them), and it is a no-op on production. The stand-ins are gone from the test harness. `20261106130000_roleplay_sessions_production_columns.sql` adds three `roleplay_sessions` columns production has by hand (`adaptation_score`, `partner_style`, `partner_confidence`).
3. **Committed the production snapshot** (`supabase/baseline/production-2026-11-06.json`) and a test (`src/test/db/schemaBaseline.test.ts`) that fails on any new difference between the files and that snapshot, and also when a known difference is fixed (then re-capture the snapshot).
4. **Mapped files to history** (`supabase/baseline/migration-history-map.json`), checked by the same test: every file has a status, and every one of production's 41 history entries is accounted for.

**Result after the owner applied the fixes below and the snapshot was re-captured: all 51 tables and all 8 functions match production exactly.** The test now expects zero differences.

## What was different in production (fixed by the owner on 2026-11-06)

| Finding | Effect | Fix |
|---|---|---|
| `conversation_turns` has no `started_at` / `ended_at`. Migration `030_ai_doctor_realtime_timing.sql` was never applied. | `src/app/api/voice-partner/turn/route.ts` inserts both columns; the insert is best-effort and only logs a warning, so the evidence rows for voice-partner turns are not saved. Production holds 3 rows in `conversation_turns`, the newest from 2026-09-18, and none in the last 14 days. | Run `supabase/migrations/030_ai_doctor_realtime_timing.sql`. |
| The `sessions` policy "manager sessions read" checks only that the row's rep is in the caller's company. | Any rep can read every colleague's session rows (level, accuracy, XP, time). The app does not rely on it: reps read their own rows and managers go through the server's admin client. | Run `supabase/migrations/20261106150000_sessions_manager_read_fix.sql`. |
| `auth_company_id()` and `auth_is_manager()` (SECURITY DEFINER) had no pinned `search_path` / `STABLE`. | A SECURITY DEFINER function without a fixed `search_path` can be hijacked by an object a caller creates earlier in the path. | Same file as above pins `search_path = public, pg_temp` and `STABLE`. |

Merging does not apply migrations, so the owner pasted the `030` file and the `20261106150000` file into the SQL editor. A read-only check confirmed: both timing columns exist, the sessions policy requires `auth_is_manager()`, and both helpers show `s` and `search_path=public, pg_temp`. The fingerprints were then re-captured (`recapturedAt` in the snapshot) and the `KNOWN_*_DRIFT` lists in the test are empty. The validation pilot migration (`20261106140000`) still waits for approval.

Function fingerprints hash the body with whitespace collapsed and trimmed: production's helper bodies are wrapped in newlines, the files' are not, and the content is identical.

## Migration history

Production's history table records 41 entries. Nothing in the repo or in Netlify applies migrations on merge, and the GitHub integration is not connected, so the history table is a record, not a mechanism. Findings:

- **22 files are not in the history but their objects exist** (fingerprint match): 001, 002 (partly), 005, 014 to 022, 024 to 028, and seven from November (`share_with_manager` to `ihia_proposals_lock_down`). Recording them would be cosmetic; the map plus the fingerprint test is the stronger evidence, so no history rows are inserted.
- **Names differ.** Production records apply timestamps and short names; the files use numbers or their own timestamps. The map pairs them.
- **Three production entries are net no-ops**: `styleshift_review_progress`, its index, and the migration that removed both.
- **Two files are numbered 030.** Both are real; they sort by name and do not conflict.
- **`003a_...` sorts before 004, which is earlier than production's last recorded migration.** If the Supabase CLI is ever used for `db push`, it will ask for `--include-all`. Today migrations are applied by hand, so this has no effect.
