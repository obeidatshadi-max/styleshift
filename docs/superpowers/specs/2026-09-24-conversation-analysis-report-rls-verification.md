# RLS verification — transcript_segments, customer_visits, conversation_reports

Run once against the applied migration (033), via the Supabase SQL editor or
`supabase` MCP `execute_sql`, using two real auth users' JWTs (rep A, rep B):

1. As rep A, insert a `customer_visits` row. As rep B, `select * from customer_visits where rep_id = '<rep A id>'` — expect zero rows (RLS blocks it), not an error.
2. As rep A, insert `transcript_segments` for that visit. As rep B, attempt the same `select` — expect zero rows.
3. As rep A, insert a `conversation_reports` row referencing that visit. As rep B, attempt `select`/`update`/`delete` on that row's `id` — expect zero rows affected / permission denied, never a successful cross-rep read or write.
4. As rep A, `delete from customer_visits where id = '<the visit>'` — expect success (rep can delete their own real-customer data on request, satisfying the product spec's retention/deletion requirement).

Record the actual result of each step here with a date once run. This
checklist exists because this repo's test suite (Vitest) has no SQL/RLS
runner — do not skip it as "covered by unit tests," since none of Tasks
1–17 executes real Postgres RLS.

## Results

| Step | Date run | Result |
|------|----------|--------|
| 1    | _not yet run_ | |
| 2    | _not yet run_ | |
| 3    | _not yet run_ | |
| 4    | _not yet run_ | |
