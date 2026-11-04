// Runs the real server functions against a small in-memory Supabase stand-in, so company
// isolation, who may write which evidence, and baseline measurement are tested end to end.
import { afterEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
let nextId = 1

class Query {
  private filters: ((r: Row) => boolean)[] = []
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row = {}
  private wantSingle = false
  constructor(private table: string) {}
  select() { return this }
  order() { return this }
  limit() { return this }
  eq(c: string, v: unknown) { this.filters.push(r => r[c] === v); return this }
  in(c: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[c])); return this }
  is(c: string, v: unknown) { this.filters.push(r => (r[c] ?? null) === v); return this }
  insert(p: Row) { this.op = 'insert'; this.payload = p; return this }
  update(p: Row) { this.op = 'update'; this.payload = p; return this }
  single() { this.wantSingle = true; return this }
  maybeSingle() { this.wantSingle = true; return this }
  then(resolve: (v: { data: unknown; error: unknown }) => void) { resolve(this.run()) }
  private run() {
    const rows = (db[this.table] ??= [])
    if (this.op === 'insert') {
      const row: Row = { id: `id-${nextId++}`, created_at: '2026-10-20T10:00:00Z', closed_at: null, acknowledged_at: null, ...this.payload }
      if (this.table === 'coaching_followups' && rows.some(r => r.rep_id === row.rep_id && r.metric_key === row.metric_key && r.drill_kind === row.drill_kind && r.closed_at === null))
        return { data: null, error: { code: '23505' } }
      if (this.table === 'coaching_field_checks') {
        const ok = (row.kind === 'self_reported' && row.recorded_by === row.rep_id) || (row.kind === 'verified' && row.recorded_by !== row.rep_id)
        if (!ok) return { data: null, error: { code: '23514' } }
      }
      rows.push(row)
      return { data: row, error: null }
    }
    const hit = rows.filter(r => this.filters.every(f => f(r)))
    if (this.op === 'update') { hit.forEach(r => Object.assign(r, this.payload)); return { data: hit, error: null } }
    return { data: this.wantSingle ? hit[0] ?? null : hit, error: null }
  }
}

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => ({ from: (t: string) => new Query(t) }) }))
vi.mock('@/lib/behavioral-trends-dashboard', () => ({ getBehavioralTrendsForReps: async () => new Map() }))

import { addFieldCheck, acknowledgeFollowup, closeFollowup, createFollowup, getManagerBoard, getRepReport } from './server'
import { parseFollowupRequest } from './permissions'

const REP_A = '11111111-1111-4111-8111-111111111111'
const REP_B = '22222222-2222-4222-8222-222222222222'

function seed() {
  for (const k of Object.keys(db)) delete db[k]
  nextId = 1
  db.profiles = [
    { id: 'mgr-a', role: 'manager', company_id: 'co-a', display_name: 'Manager A' },
    { id: 'mgr-b', role: 'manager', company_id: 'co-b', display_name: 'Manager B' },
    { id: REP_A, role: 'rep', company_id: 'co-a', display_name: 'Ali' },
    { id: REP_B, role: 'rep', company_id: 'co-b', display_name: 'Zainab' },
  ]
  // Ali: 4 AI-doctor sessions, probing falls from ~60 to ~44.
  db.voice_partner_sessions = [1, 2, 3, 4].map(i => ({ id: `vs${i}`, rep_id: REP_A, objection_type: 'doubt' }))
  db.session_scorecards = [60, 58, 45, 43].map((open, i) => ({
    rep_id: REP_A, session_id: `vs${i + 1}`, created_at: `2026-10-0${i + 1}T09:00:00Z`, adaptation_score: null,
    signals: { repTurnCount: 5, openQuestionRatio: open / 100, clearStepsHitCount: 3, avgRepTurnLength: 70, clearStepsSequence: [] },
  }))
  db.roleplay_sessions = []
  db.drill_attempts = []
}

const req = (repId: string) => parseFollowupRequest({
  repId, drillKind: 'precision_drill', metricKey: 'open_question_ratio', source: 'ai_doctor', objectionType: null, clearStep: 'clarify',
})!

afterEach(() => vi.clearAllMocks())

describe('assigning a follow-up', () => {
  it('measures the baseline on the server from the rep own recent sessions', async () => {
    seed()
    const res = await createFollowup('mgr-a', req(REP_A))
    expect(res).toMatchObject({ ok: true, existing: false })
    expect(db.coaching_followups[0]).toMatchObject({ company_id: 'co-a', rep_id: REP_A, created_by: 'mgr-a', baseline_value: 51.5, baseline_n: 4 })
  })

  it('leaves the baseline empty when the rep has fewer than 2 sessions of that kind', async () => {
    seed()
    db.session_scorecards = db.session_scorecards.slice(0, 1)
    await createFollowup('mgr-a', req(REP_A))
    expect(db.coaching_followups[0]).toMatchObject({ baseline_value: null, baseline_n: 1 })
  })

  it('refuses a manager from another company and writes nothing', async () => {
    seed()
    expect(await createFollowup('mgr-b', req(REP_A))).toEqual({ ok: false, error: 'forbidden' })
    expect(await createFollowup(REP_A, req(REP_A))).toEqual({ ok: false, error: 'forbidden' })
    expect(db.coaching_followups ?? []).toHaveLength(0)
  })

  it('does not create a second open follow-up for the same focus', async () => {
    seed()
    await createFollowup('mgr-a', req(REP_A))
    expect(await createFollowup('mgr-a', req(REP_A))).toMatchObject({ ok: true, existing: true })
    expect(db.coaching_followups).toHaveLength(1)
  })
})

describe('field evidence on a follow-up', () => {
  async function withFollowup() {
    seed()
    await createFollowup('mgr-a', req(REP_A))
    return db.coaching_followups[0].id as string
  }
  const check = (followupId: string, kind: 'self_reported' | 'verified') => ({ followupId, kind, observed: 'seen' as const, note: null })

  it('stores a rep self-report and a manager verification as different kinds with different authors', async () => {
    const id = await withFollowup()
    expect(await addFieldCheck(REP_A, check(id, 'self_reported'))).toBe('ok')
    expect(await addFieldCheck('mgr-a', check(id, 'verified'))).toBe('ok')
    expect(db.coaching_field_checks.map(c => [c.kind, c.recorded_by])).toEqual([['self_reported', REP_A], ['verified', 'mgr-a']])
  })

  it('refuses a rep verifying themselves, a manager faking a self-report, and a manager of another company', async () => {
    const id = await withFollowup()
    expect(await addFieldCheck(REP_A, check(id, 'verified'))).toBe('forbidden')
    expect(await addFieldCheck('mgr-a', check(id, 'self_reported'))).toBe('forbidden')
    expect(await addFieldCheck('mgr-b', check(id, 'verified'))).toBe('forbidden')
    expect(await addFieldCheck(REP_B, check(id, 'self_reported'))).toBe('forbidden')
    expect(db.coaching_field_checks ?? []).toHaveLength(0)
  })

  it('reports not_found for an unknown follow-up and refuses evidence once it is closed', async () => {
    const id = await withFollowup()
    expect(await addFieldCheck(REP_A, check('missing', 'self_reported'))).toBe('not_found')
    expect(await closeFollowup('mgr-a', id)).toBe('ok')
    expect(await addFieldCheck(REP_A, check(id, 'self_reported'))).toBe('forbidden')
  })

  it('lets only the rep acknowledge and only the company manager close', async () => {
    const id = await withFollowup()
    expect(await acknowledgeFollowup('mgr-a', id)).toBe('forbidden')
    expect(await acknowledgeFollowup(REP_A, id)).toBe('ok')
    expect(await closeFollowup('mgr-b', id)).toBe('forbidden')
    expect(await closeFollowup(REP_A, id)).toBe('forbidden')
    expect(db.coaching_followups[0].acknowledged_at).not.toBeNull()
  })
})

describe('reports read from the database', () => {
  it('shows a manager only the reps of their own company', async () => {
    seed()
    const a = await getManagerBoard('mgr-a')
    const b = await getManagerBoard('mgr-b')
    expect(a!.map(r => r.name)).toEqual(['Ali'])
    expect(b!.map(r => r.name)).toEqual(['Zainab'])
    expect(await getManagerBoard(REP_A)).toBeNull()
  })

  it('builds the rep report with a decline-driven roadmap item and a separate evidence count', async () => {
    seed()
    const id = await (async () => { await createFollowup('mgr-a', req(REP_A)); return db.coaching_followups[0].id as string })()
    await addFieldCheck(REP_A, { followupId: id, kind: 'self_reported', observed: 'seen', note: null })
    const { report } = await getRepReport(REP_A, new Date('2026-10-21T00:00:00Z'))
    expect(report.evidence.observedPractice.sessions).toBe(4)
    expect(report.evidence.selfReported.total).toBe(1)
    expect(report.evidence.verified.total).toBe(0)
    expect(report.roadmap.items[0]).toMatchObject({ metricKey: 'open_question_ratio', reason: 'declining' })
    expect(report.caveats).toContain('no_verified_field_evidence')
  })

  it('gives a rep with no practice an empty, honestly labelled report', async () => {
    seed()
    const { report } = await getRepReport(REP_B)
    expect(report.roadmap.status).toBe('no_data')
    expect(report.caveats).toEqual(['no_sessions'])
  })
})
