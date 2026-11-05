import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CRITERIA } from './certification'
import { issue, listMine, lookupByCode, overview, revoke, type ManagerStats } from './certification-service'

const now = new Date('2026-11-05T12:00:00Z')
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

type Row = Record<string, unknown>
/** A small in-memory stand-in for the Supabase query builder: eq / is / gte / ilike / in filters, insert, update. */
function fakeDb(tables: Record<string, Row[]>, opts: { insertErrors?: Array<{ code: string; message: string }> } = {}) {
  const inserted: Row[] = []
  const updated: Row[] = []
  const errors = [...(opts.insertErrors ?? [])]
  const db = {
    from(name: string) {
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      let one: 'none' | 'single' | 'maybe' = 'none'
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q },
        gte: (c: string, v: string) => { filters.push(r => String(r[c]) >= v); return q },
        ilike: (c: string, v: string) => { filters.push(r => String(r[c]).toLowerCase() === v.replace(/\\/g, '').toLowerCase()); return q },
        in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
        order: () => q, limit: () => q,
        insert: (row: Row) => { op = 'insert'; payload = row; return q },
        update: (patch: Row) => { op = 'update'; payload = patch; return q },
        single: () => { one = 'single'; return q },
        maybeSingle: () => { one = 'maybe'; return q },
        then: (resolve: (v: unknown) => void) => {
          const rows = (tables[name] ?? []).filter(r => filters.every(f => f(r)))
          if (op === 'insert') {
            const err = errors.shift()
            if (err) return resolve({ data: null, error: err })
            const row = { id: `new-${inserted.length + 1}`, issued_at: now.toISOString(), revoked_at: null, revoke_reason: null, ...payload }
            inserted.push(row); return resolve({ data: row, error: null })
          }
          if (op === 'update') {
            const hit = rows[0]
            if (hit) { Object.assign(hit, payload); updated.push(hit) }
            return resolve({ data: hit ?? null, error: null })
          }
          return resolve({ data: one === 'none' ? rows : (rows[0] ?? null), error: null })
        },
      }
      return q
    },
  }
  return { db: db as never, inserted, updated }
}

const stats: ManagerStats = {
  companyId: 'co-1', companyName: 'Wafi',
  reps: [
    { id: 'rep-1', display_name: 'Rana', total_sessions: 12, avg_accuracy: 80 },
    { id: 'rep-2', display_name: 'Omar', total_sessions: 2, avg_accuracy: 40 },
  ],
}
const strongVoice = (repId: string): Row[] => [
  ...Array.from({ length: 4 }, (_, i) => ({ rep_id: repId, outcome: 'won', created_at: day(i + 1) })),
  { rep_id: repId, outcome: 'escalated', created_at: day(6) },
]
const tables = () => ({
  voice_partner_sessions: [...strongVoice('rep-1'), { rep_id: 'rep-2', outcome: 'escalated', created_at: day(2) }],
  session_scorecards: [] as Row[],
  certifications: [] as Row[],
  audit_events: [] as Row[],
  profiles: [{ id: 'mgr-1', display_name: 'Shadi' }],
})
const ok = { repId: 'rep-1', programName: ' Field Ready ', criteria: DEFAULT_CRITERIA }

describe('issue', () => {
  it('issues to a rep who meets the criteria, using evidence the server computes', async () => {
    const { db, inserted } = fakeDb(tables())
    const withFakeEvidence: Record<string, unknown> = { ...ok, evidence: { gameSessions: 999 } }
    const r = await issue(db, 'mgr-1', stats, withFakeEvidence, now)
    expect(r.status).toBe(201)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      company_id: 'co-1', rep_id: 'rep-1', rep_name: 'Rana', program_name: 'Field Ready', criteria_met: true,
      exception_reason: null, issued_by: 'mgr-1',
    })
    expect(inserted[0].evidence).toMatchObject({ gameSessions: 12, voiceSessions: 5, winRate: 80 })
    expect(String(inserted[0].verify_code)).toMatch(/^[A-HJKMNP-Z2-9]{12}$/)
  })

  it('refuses a rep who does not meet the criteria, and lists what is short', async () => {
    const { db, inserted } = fakeDb(tables())
    const r = await issue(db, 'mgr-1', stats, { ...ok, repId: 'rep-2' }, now)
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('criteria_not_met')
    expect((r.body.checks as Array<{ passed: boolean }>).some(c => !c.passed)).toBe(true)
    expect(inserted).toHaveLength(0)
  })

  it('issues an exception only with a written reason, and records that it was not met', async () => {
    const { db, inserted } = fakeDb(tables())
    expect((await issue(db, 'mgr-1', stats, { ...ok, repId: 'rep-2', exceptionReason: '   ' }, now)).status).toBe(409)
    const r = await issue(db, 'mgr-1', stats, { ...ok, repId: 'rep-2', exceptionReason: 'Joined mid-quarter, strong field results' }, now)
    expect(r.status).toBe(201)
    expect(inserted[0]).toMatchObject({ criteria_met: false, exception_reason: 'Joined mid-quarter, strong field results' })
  })

  it('does not store an exception reason on a certificate that met the criteria', async () => {
    const { db, inserted } = fakeDb(tables())
    await issue(db, 'mgr-1', stats, { ...ok, exceptionReason: 'not needed' }, now)
    expect(inserted[0].exception_reason).toBeNull()
  })

  it('refuses bad input, a rep outside the team, and a second live certificate with the same name', async () => {
    const { db } = fakeDb({ ...tables(), certifications: [{ id: 'c1', rep_id: 'rep-1', program_name: 'field ready', revoked_at: null }] })
    expect((await issue(db, 'mgr-1', stats, { ...ok, programName: '  ' }, now)).status).toBe(400)
    expect((await issue(db, 'mgr-1', stats, { ...ok, programName: 'x'.repeat(121) }, now)).status).toBe(400)
    expect((await issue(db, 'mgr-1', stats, { ...ok, criteria: { ...DEFAULT_CRITERIA, minAccuracy: 500 } }, now)).status).toBe(400)
    expect((await issue(db, 'mgr-1', stats, { ...ok, repId: 'someone-else' }, now)).status).toBe(404)
    expect((await issue(db, 'mgr-1', stats, ok, now))).toMatchObject({ status: 409, body: { error: 'already_certified' } })
  })

  it('allows the same name again once the earlier certificate was withdrawn', async () => {
    const { db } = fakeDb({ ...tables(), certifications: [{ id: 'c1', rep_id: 'rep-1', program_name: 'Field Ready', revoked_at: day(1) }] })
    expect((await issue(db, 'mgr-1', stats, ok, now)).status).toBe(201)
  })

  it('tries a new code when one is taken, and reports a race on the live-certificate rule as already certified', async () => {
    const a = fakeDb(tables(), { insertErrors: [{ code: '23505', message: 'duplicate key value violates unique constraint "certifications_verify_code_key"' }] })
    expect((await issue(a.db, 'mgr-1', stats, ok, now)).status).toBe(201)
    expect(a.inserted).toHaveLength(1)
    const b = fakeDb(tables(), { insertErrors: [{ code: '23505', message: 'duplicate key value violates unique constraint "certifications_one_live_per_program"' }] })
    expect((await issue(b.db, 'mgr-1', stats, ok, now))).toMatchObject({ status: 409, body: { error: 'already_certified' } })
    const c = fakeDb(tables(), { insertErrors: [{ code: '08006', message: 'down' }] })
    expect((await issue(c.db, 'mgr-1', stats, ok, now)).status).toBe(503)
  })
})

describe('revoke', () => {
  const cert = () => ({ id: 'c1', company_id: 'co-1', rep_id: 'rep-1', program_name: 'Field Ready', revoked_at: null })
  it('needs a reason and withdraws a live certificate of the caller\'s company', async () => {
    const { db, updated } = fakeDb({ ...tables(), certifications: [cert()] })
    expect((await revoke(db, 'mgr-1', stats, { id: 'c1', reason: '  ' }, now)).status).toBe(400)
    expect((await revoke(db, 'mgr-1', stats, { id: 7, reason: 'x' }, now)).status).toBe(400)
    const r = await revoke(db, 'mgr-1', stats, { id: 'c1', reason: 'Left the company' }, now)
    expect(r.status).toBe(200)
    expect(updated[0]).toMatchObject({ revoked_by: 'mgr-1', revoke_reason: 'Left the company', revoked_at: now.toISOString() })
  })
  it('cannot touch another company\'s certificate or one already withdrawn', async () => {
    const { db } = fakeDb({ ...tables(), certifications: [{ ...cert(), company_id: 'co-2' }, { ...cert(), id: 'c2', revoked_at: day(1) }] })
    expect((await revoke(db, 'mgr-1', stats, { id: 'c1', reason: 'x' }, now)).status).toBe(404)
    expect((await revoke(db, 'mgr-1', stats, { id: 'c2', reason: 'x' }, now)).status).toBe(404)
  })
})

describe('overview', () => {
  it('returns each rep\'s live evidence, the certificates, and the audit trail with the actor\'s name', async () => {
    const t = tables()
    t.certifications = [{ id: 'c1', company_id: 'co-1', rep_id: 'rep-1', rep_name: 'Rana', program_name: 'Field Ready', criteria: DEFAULT_CRITERIA, evidence: {}, criteria_met: true, verify_code: 'ABCDEFGHJKMN', issued_at: day(1), revoked_at: null }]
    t.audit_events = [{ id: 1, company_id: 'co-1', actor_id: 'mgr-1', action: 'certification.issued', subject_type: 'certification', subject_id: 'c1', details: { program: 'Field Ready' }, created_at: day(1) }]
    const { db } = fakeDb(t)
    const r = await overview(db, stats, now)
    expect(r.status).toBe(200)
    const body = r.body as { reps: Array<{ id: string; evidence: { voiceSessions: number; winRate: number | null } }>; certificates: Array<{ verifyCode: string }>; audit: Array<{ actor: string | null }> }
    expect(body.reps.find(x => x.id === 'rep-1')!.evidence).toMatchObject({ voiceSessions: 5, winRate: 80 })
    expect(body.reps.find(x => x.id === 'rep-2')!.evidence).toMatchObject({ voiceSessions: 1, winRate: 0 })
    expect(body.certificates[0].verifyCode).toBe('ABCDEFGHJKMN')
    expect(body.audit[0].actor).toBe('Shadi')
  })
})

describe('listMine and lookupByCode', () => {
  it('lists only the rep\'s own certificates', async () => {
    const { db } = fakeDb({ ...tables(), certifications: [
      { id: 'a', rep_id: 'rep-1', program_name: 'Field Ready', verify_code: 'ABCDEFGHJKMN', issued_at: day(1), revoked_at: null },
      { id: 'b', rep_id: 'rep-2', program_name: 'Other', verify_code: 'ABCDEFGHJKMP', issued_at: day(1), revoked_at: null },
    ] })
    const r = await listMine(db, 'rep-1')
    expect(r.body.certificates).toEqual([{ id: 'a', program: 'Field Ready', verifyCode: 'ABCDEFGHJKMN', issuedAt: day(1), revoked: false }])
  })

  it('gives the public check only who, what, which company and when, never evidence or reasons', async () => {
    const { db } = fakeDb({ ...tables(), companies: [{ id: 'co-1', name: 'Wafi' }], certifications: [{
      id: 'a', company_id: 'co-1', rep_id: 'rep-1', rep_name: 'Rana', program_name: 'Field Ready', verify_code: 'ABCDEFGHJKMN', issued_at: day(1),
      revoked_at: day(0), revoke_reason: 'private reason', evidence: { winRate: 80 }, exception_reason: 'private',
    }] })
    const found = await lookupByCode(db, 'ABCDEFGHJKMN')
    expect(found).toEqual({ program: 'Field Ready', repName: 'Rana', companyName: 'Wafi', issuedAt: day(1), revokedAt: day(0) })
    expect(JSON.stringify(found)).not.toMatch(/private|winRate/)
    expect(await lookupByCode(db, 'ZZZZZZZZZZZZ')).toBeNull()
  })
})
