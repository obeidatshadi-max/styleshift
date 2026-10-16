// Disposable PostgreSQL (PGlite) verification. Never connects to Supabase or reads .env.
// Optional dev tool: npm install --prefix <temp-folder> @electric-sql/pglite
// node tools/verify-ihia-db.mjs <absolute-path-to-pglite/dist/index.js>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const modulePath = process.argv[2]
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite')
const db = new PGlite()
const reviewer = '10000000-0000-4000-8000-000000000001'
const ordinary = '10000000-0000-4000-8000-000000000002'
let checks = 0
function check(condition, message) { assert.ok(condition, message); checks++ }
async function denied(sql, params = []) {
  await assert.rejects(db.query(sql, params)); checks++
}
async function as(role, id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec(`set role ${role}`)
}
try {
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`)
  await db.query('insert into auth.users values ($1), ($2)', [reviewer, ordinary])
  await db.exec(await readFile(new URL('../supabase/migrations/20261016074203_ihia_knowledge.sql', import.meta.url), 'utf8'))
  await db.query('insert into public.ihia_reviewers values ($1)', [reviewer])
  await as('authenticated', reviewer)
  const entry = (await db.query(`insert into public.ihia_entries
    (expression,literal_meaning,contextual_meaning,region,specialty,kind,uncertainty,source_reference,created_by)
    values ('ما عندي وكت','No time','ضيق الوقت','baghdad','general','workflow','Clarify context','Synthetic review',$1)
    returning *`, [reviewer])).rows[0]
  check(entry.status === 'draft' && entry.version === 1, 'Starts in draft')
  const id = entry.id
  check((await db.query('select * from public.ihia_history')).rows.length === 1, 'Insert audited')
  await denied("update public.ihia_entries set status='approved' where id=$1", [id])
  await as('authenticated', ordinary)
  check((await db.query('select * from public.ihia_entries')).rows.length === 0, 'Draft excluded from normal reader')
  check((await db.query('select * from public.ihia_history')).rows.length === 0, 'History hidden')
  check((await db.query('select * from public.ihia_reviewers')).rows.length === 0, 'Reviewer grants hidden')
  await denied('insert into public.ihia_reviewers values ($1)', [ordinary])
  await denied(`insert into public.ihia_entries
    (expression,literal_meaning,contextual_meaning,region,specialty,kind,uncertainty,source_reference,created_by)
    values ('x','x','x','baghdad','general','dialect','x','x',$1)`, [ordinary])
  check((await db.query("update public.ihia_entries set status='approved' returning id")).rows.length === 0, 'Unauthorized update cannot touch draft')
  await as('authenticated', reviewer)
  const approved = (await db.query("update public.ihia_entries set status='approved',review_note='Expert reviewed' where id=$1 returning *", [id])).rows[0]
  check(approved.status === 'approved' && approved.version === 2 && approved.reviewed_by === reviewer, 'Approval stamped')
  await as('authenticated', ordinary)
  check((await db.query('select * from public.ihia_entries')).rows.length === 1, 'Approved visible')
  check((await db.query("update public.ihia_entries set contextual_meaning='attack' returning id")).rows.length === 0, 'Reader cannot change approved')
  await denied('delete from public.ihia_entries')
  await as('anon', '')
  await denied('select * from public.ihia_entries')
  await as('authenticated', reviewer)
  const corrected = (await db.query("update public.ihia_entries set contextual_meaning='Corrected',status='approved',review_note='Correction' where id=$1 returning *", [id])).rows[0]
  check(corrected.status === 'draft' && corrected.version === 3 && corrected.reviewed_by === null, 'Direct REST correction cannot bypass reapproval')
  check((await db.query('select * from public.ihia_history where entry_id=$1', [id])).rows.length === 3, 'Every version captured')
  await denied("update public.ihia_history set snapshot='{}'")
  await denied("insert into public.ihia_history(entry_id,version,actor_id,snapshot) values ($1,999,$2,'{}')", [id, reviewer])
  await db.query("update public.ihia_entries set status='rejected',review_note='Reject correction' where id=$1", [id])
  await as('authenticated', ordinary)
  check((await db.query('select * from public.ihia_entries')).rows.length === 0, 'Rejected excluded')
  console.log(`IHIA PostgreSQL checks passed: ${checks}`)
} finally { await db.close() }
