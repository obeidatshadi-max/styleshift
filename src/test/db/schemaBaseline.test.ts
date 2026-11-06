import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDb, type TestDb } from './supabaseTestDb'
import {
  TABLE_FINGERPRINT_SQL, FUNCTION_FINGERPRINT_SQL, parseTableFingerprint, parseFunctionFingerprint, diffTableFingerprints,
} from './catalogFingerprint'

/**
 * Production schema baseline (docs/security/schema-baseline.md).
 *
 * A database built from supabase/migrations is compared with a read-only snapshot of production taken on
 * 2026-11-06. The comparison must show EXACTLY the differences listed below and nothing else: new drift fails the
 * test, and so does a listed difference that has been fixed (then re-capture the snapshot and shorten the list).
 */
const BASELINE_DIR = join(process.cwd(), 'supabase', 'baseline')
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
const snapshot = JSON.parse(readFileSync(join(BASELINE_DIR, 'production-2026-11-06.json'), 'utf8')) as {
  tables: string; functions: string; history: string[]
}
const map = JSON.parse(readFileSync(join(BASELINE_DIR, 'migration-history-map.json'), 'utf8')) as {
  files: Record<string, { status: string; prod?: string; note?: string }>; prodOnly: Record<string, string>
}

/** Differences from production that are known and waiting for the owner to run a file in the SQL editor. */
const KNOWN_TABLE_DRIFT = [
  // 030_ai_doctor_realtime_timing was never applied: production has no started_at / ended_at.
  { table: 'conversation_turns', parts: ['columns'] },
  // production's "manager sessions read" policy has no manager check; 20261106150000 fixes it.
  { table: 'sessions', parts: ['policies'] },
]
const KNOWN_FUNCTION_DRIFT = ['auth_company_id()', 'auth_is_manager()'] // 20261106150000 pins search_path and STABLE

describe('schema baseline: files vs production snapshot', () => {
  let t: TestDb
  beforeAll(async () => { t = await createTestDb() }, 120000)

  it('every migration file applies to an empty database', () => {
    expect(t.migrations.filter(m => !m.ok)).toEqual([])
  })

  it('tables match production except for the known, owner-pending differences', async () => {
    const repo = parseTableFingerprint((await t.asService<{ fp: string }>(TABLE_FINGERPRINT_SQL))[0].fp)
    expect(diffTableFingerprints(repo, parseTableFingerprint(snapshot.tables))).toEqual(KNOWN_TABLE_DRIFT)
  })

  it('functions match production except for the known, owner-pending differences', async () => {
    const repo = parseFunctionFingerprint((await t.asService<{ fp: string }>(FUNCTION_FINGERPRINT_SQL))[0].fp)
    const prod = parseFunctionFingerprint(snapshot.functions)
    const names = [...new Set([...Object.keys(repo), ...Object.keys(prod)])].sort()
    const differing = names.filter(n => JSON.stringify(repo[n]) !== JSON.stringify(prod[n]))
    expect(differing).toEqual(KNOWN_FUNCTION_DRIFT)
  })

  it('the three tables production had without a migration are now created by a file', () => {
    const baseline = readFileSync(join(MIGRATIONS_DIR, '003a_production_baseline_gap.sql'), 'utf8')
    for (const name of ['doctors', 'doctor_visits', 'daily_challenges']) {
      expect(baseline).toContain(`create table if not exists public.${name}`)
    }
  })
})

describe('migration history map', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  const inMap = Object.keys(map.files).sort()

  it('lists every migration file, and nothing that is not a file', () => {
    expect(inMap).toEqual(files)
  })

  it('each file has a status, and recorded ones name the production entry', () => {
    for (const [file, e] of Object.entries(map.files)) {
      expect(['recorded', 'unrecorded', 'baseline', 'not-applied'], file).toContain(e.status)
      if (e.status === 'recorded') expect(e.prod, file).toBeTruthy()
      if (e.status === 'unrecorded' || e.status === 'not-applied') expect(e.note, file).toBeTruthy()
    }
  })

  it('accounts for every production history entry exactly once, and invents none', () => {
    const claimed = Object.values(map.files).flatMap(e => (e.prod ? e.prod.split('; ') : [])).concat(Object.keys(map.prodOnly))
    // The same entry may be claimed by two files that share it (e.g. fix_rls_recursion); the sets must still agree.
    expect([...new Set(claimed)].sort()).toEqual([...snapshot.history].sort())
  })

  it('no file marked recorded or unrecorded is a migration that changes production state without being applied', () => {
    const notApplied = Object.entries(map.files).filter(([, e]) => e.status === 'not-applied').map(([f]) => f)
    expect(notApplied).toEqual([
      '030_ai_doctor_realtime_timing.sql',
      '20261106140000_validation_pilot.sql',
      '20261106150000_sessions_manager_read_fix.sql',
    ])
  })
})
