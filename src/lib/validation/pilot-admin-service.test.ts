import { describe, it, expect } from 'vitest'
import { addCase, addMember, changeStatus, createPilot, getPilot, type CaseRow, type Member, type Pilot, type PilotAdminStore, type Person } from './pilot-admin-service'

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CO = u(1), ADMIN = u(10), A1 = u(11), A2 = u(12), MGR = u(13), REP = u(20), OUTSIDER = u(30), SESSION = u(40)

function fake(over: { pilot?: Partial<Pilot> | null; members?: Member[]; cases?: CaseRow[]; sessionOk?: boolean } = {}) {
  const calls: string[] = []
  const profiles: Record<string, Person & { companyId: string | null }> = {
    [ADMIN]: { id: ADMIN, displayName: 'Admin', role: 'manager', companyId: CO },
    [A1]: { id: A1, displayName: 'Assessor 1', role: 'rep', companyId: CO },
    [A2]: { id: A2, displayName: 'Assessor 2', role: 'rep', companyId: CO },
    [MGR]: { id: MGR, displayName: 'Mgr', role: 'manager', companyId: CO },
    [REP]: { id: REP, displayName: 'Rep', role: 'rep', companyId: CO },
    [OUTSIDER]: { id: OUTSIDER, displayName: 'Outsider', role: 'rep', companyId: u(2) },
  }
  const pilot: Pilot | null = over.pilot === null ? null : { id: u(100), name: 'P', status: 'draft', dataSource: 'synthetic', companyId: CO, ...over.pilot }
  const members = over.members ?? [{ userId: A1, role: 'assessor', displayName: 'Assessor 1' }, { userId: A2, role: 'assessor', displayName: 'Assessor 2' }, { userId: MGR, role: 'assessor', displayName: 'Mgr' }]
  const store: PilotAdminStore = {
    myPilots: async () => (pilot ? [pilot] : []),
    pilot: async () => pilot,
    createPilot: async i => { calls.push(`createPilot:${i.companyId}`); return { id: u(100) } },
    members: async () => members,
    people: async () => Object.values(profiles).filter(p => p.companyId === CO),
    profile: async id => profiles[id] ?? null,
    addMember: async (_p, id, role) => { calls.push(`addMember:${id}:${role}`) },
    cases: async () => over.cases ?? [],
    sessionBelongsToRep: async () => over.sessionOk ?? true,
    addCase: async () => { calls.push('addCase'); return { id: u(200) } },
    setStatus: async (_p, s) => { calls.push(`setStatus:${s}`) },
  }
  return { store, calls }
}

const goodCase = (over: Record<string, unknown> = {}) => ({
  repId: REP, sessionType: 'ai_doctor_text', sessionId: SESSION, scenarioType: 'A', scenarioVersion: 'v1', phase: 'baseline', seenBefore: false, assessorIds: [A1, A2], ...over,
})

describe('createPilot', () => {
  it('only a manager can start a pilot, and only for their own company', async () => {
    const { store, calls } = fake()
    expect((await createPilot(store, null, { name: 'X', dataSource: 'synthetic' })).status).toBe(403)
    expect(calls).toEqual([])
    expect((await createPilot(store, CO, { name: 'X', dataSource: 'synthetic' })).status).toBe(201)
    expect(calls).toEqual([`createPilot:${CO}`])
  })
  it('needs a name of sensible length and a data source label', async () => {
    const { store } = fake()
    expect((await createPilot(store, CO, { name: '  ', dataSource: 'synthetic' })).status).toBe(400)
    expect((await createPilot(store, CO, { name: 'x'.repeat(121), dataSource: 'synthetic' })).status).toBe(400)
    expect((await createPilot(store, CO, { name: 'X', dataSource: 'real' })).status).toBe(400)
  })
})

describe('getPilot', () => {
  it('is 404 for someone who does not administer the pilot, and reads nothing else', async () => {
    const { store } = fake({ pilot: null })
    expect((await getPilot(store, u(100))).status).toBe(404)
  })
})

describe('addMember', () => {
  it('adds an assessor from the company', async () => {
    const { store, calls } = fake()
    expect((await addMember(store, u(100), { userId: REP, role: 'assessor' })).status).toBe(200)
    expect(calls).toEqual([`addMember:${REP}:assessor`])
  })
  it('refuses someone from another company, an unknown role, and a non-manager administrator', async () => {
    const { store, calls } = fake()
    expect((await addMember(store, u(100), { userId: OUTSIDER, role: 'assessor' })).status).toBe(400)
    expect((await addMember(store, u(100), { userId: A1, role: 'boss' })).status).toBe(400)
    expect((await addMember(store, u(100), { userId: A1, role: 'administrator' })).status).toBe(400)
    expect(calls).toEqual([])
  })
  it('refuses to make a representative of the pilot a member in any role', async () => {
    const { store, calls } = fake({ members: [], cases: [{ id: u(200), repId: A1, scenarioType: 'A', phase: 'baseline', assessorIds: [A2, MGR] }] })
    for (const role of ['assessor', 'adjudicator']) expect((await addMember(store, u(100), { userId: A1, role })).status, role).toBe(409)
    expect((await addMember(store, u(100), { userId: ADMIN, role: 'administrator' })).status).toBe(200)
    expect(calls).toEqual([`addMember:${ADMIN}:administrator`])
    const asAdmin = fake({ members: [], cases: [{ id: u(200), repId: ADMIN, scenarioType: 'A', phase: 'baseline', assessorIds: [A2, MGR] }] })
    expect((await addMember(asAdmin.store, u(100), { userId: ADMIN, role: 'administrator' })).status).toBe(409)
  })
  it('refuses a repeat role, and an administrator who would also be an assessor, before the database has to', async () => {
    const { store, calls } = fake({ members: [{ userId: A1, role: 'assessor', displayName: 'A1' }, { userId: MGR, role: 'administrator', displayName: 'Mgr' }] })
    expect((await addMember(store, u(100), { userId: A1, role: 'assessor' })).status).toBe(409)
    expect((await addMember(store, u(100), { userId: MGR, role: 'assessor' })).status).toBe(409)
    expect((await addMember(store, u(100), { userId: A1, role: 'adjudicator' })).status).toBe(200)
    expect(calls).toEqual([`addMember:${A1}:adjudicator`])
  })
  it('does not change a closed pilot', async () => {
    const { store } = fake({ pilot: { status: 'closed' } })
    expect((await addMember(store, u(100), { userId: A1, role: 'assessor' })).status).toBe(409)
  })
})

describe('addCase', () => {
  it('adds a case with two assessors', async () => {
    const { store, calls } = fake()
    const r = await addCase(store, u(100), goodCase())
    expect(r.status).toBe(201)
    expect(calls).toEqual(['addCase'])
  })
  it('only while the pilot is a draft', async () => {
    for (const status of ['running', 'closed'] as const) {
      const { store, calls } = fake({ pilot: { status } })
      expect((await addCase(store, u(100), goodCase())).status).toBe(409)
      expect(calls).toEqual([])
    }
  })
  it('needs two to five different assessors, who are members as assessors', async () => {
    const { store, calls } = fake()
    expect((await addCase(store, u(100), goodCase({ assessorIds: [A1] }))).status).toBe(400)
    expect((await addCase(store, u(100), goodCase({ assessorIds: [A1, A1] }))).status).toBe(400)
    expect((await addCase(store, u(100), goodCase({ assessorIds: [A1, ADMIN] }))).status).toBe(400)
    expect((await addCase(store, u(100), goodCase({ assessorIds: [u(51), u(52), u(53), u(54), u(55), u(56)] }))).status).toBe(400)
    expect(calls).toEqual([])
  })
  it('nobody rates their own conversation', async () => {
    const { store, calls } = fake({ members: [{ userId: REP, role: 'assessor', displayName: 'Rep' }, { userId: A1, role: 'assessor', displayName: 'A1' }] })
    expect((await addCase(store, u(100), goodCase({ assessorIds: [REP, A1] }))).status).toBe(400)
    expect(calls).toEqual([])
  })
  it('the representative must be in the company and the session must be theirs', async () => {
    expect((await addCase(fake().store, u(100), goodCase({ repId: OUTSIDER }))).status).toBe(400)
    const { store, calls } = fake({ sessionOk: false })
    expect((await addCase(store, u(100), goodCase())).status).toBe(400)
    expect(calls).toEqual([])
  })
  it('refuses a representative who is already a member of the pilot', async () => {
    const { store, calls } = fake({ members: [{ userId: A1, role: 'assessor', displayName: 'A1' }, { userId: A2, role: 'assessor', displayName: 'A2' }, { userId: REP, role: 'adjudicator', displayName: 'Rep' }] })
    expect((await addCase(store, u(100), goodCase())).status).toBe(400)
    expect(calls).toEqual([])
  })
  it('re-checks that every assessor is still in the company when a case is added', async () => {
    const { store, calls } = fake({ members: [{ userId: A1, role: 'assessor', displayName: 'A1' }, { userId: OUTSIDER, role: 'assessor', displayName: 'Outsider' }] })
    expect((await addCase(store, u(100), goodCase({ assessorIds: [A1, OUTSIDER] }))).status).toBe(400)
    expect(calls).toEqual([])
  })
  it('rejects values outside the protocol', async () => {
    const { store } = fake()
    for (const bad of [{ scenarioType: 'E' }, { scenarioVersion: 'v3' }, { phase: 'midterm' }, { sessionType: 'phone' }, { seenBefore: 'no' }, { sessionId: 'x' }, { repId: 'x' }]) {
      expect((await addCase(store, u(100), goodCase(bad))).status, JSON.stringify(bad)).toBe(400)
    }
  })
  it('warns, without blocking, when an assessor is a manager in the same company', async () => {
    const r = await addCase(fake().store, u(100), goodCase({ assessorIds: [A1, MGR] }))
    expect(r.status).toBe(201)
    expect((r.body as { warnings: string[] }).warnings).toEqual([expect.stringContaining('Mgr is a manager in the same company')])
  })
})

describe('changeStatus', () => {
  const twoAssessors: CaseRow = { id: u(200), repId: REP, scenarioType: 'A', phase: 'baseline', assessorIds: [A1, A2] }
  it('starts only with at least one case and two assessors on every case', async () => {
    expect((await changeStatus(fake().store, u(100), { status: 'running' })).status).toBe(409)
    expect((await changeStatus(fake({ cases: [{ ...twoAssessors, assessorIds: [A1] }] }).store, u(100), { status: 'running' })).status).toBe(409)
    const { store, calls } = fake({ cases: [twoAssessors] })
    expect((await changeStatus(store, u(100), { status: 'running' })).status).toBe(200)
    expect(calls).toEqual(['setStatus:running'])
  })
  it('does not start if someone in the pilot has left the company, or an administrator is no longer a manager', async () => {
    const left = fake({ cases: [twoAssessors], members: [{ userId: A1, role: 'assessor', displayName: 'A1' }, { userId: OUTSIDER, role: 'assessor', displayName: 'Outsider' }] })
    expect((await changeStatus(left.store, u(100), { status: 'running' })).status).toBe(409)
    expect(left.calls).toEqual([])
    const notManager = fake({ cases: [twoAssessors], members: [{ userId: A1, role: 'administrator', displayName: 'A1' }, { userId: A2, role: 'assessor', displayName: 'A2' }] })
    expect((await changeStatus(notManager.store, u(100), { status: 'running' })).status).toBe(409)
    expect(notManager.calls).toEqual([])
  })
  it('runs, then closes, and never goes back', async () => {
    expect((await changeStatus(fake({ pilot: { status: 'running' } }).store, u(100), { status: 'closed' })).status).toBe(200)
    expect((await changeStatus(fake({ pilot: { status: 'running' } }).store, u(100), { status: 'running' })).status).toBe(409)
    expect((await changeStatus(fake({ pilot: { status: 'closed' } }).store, u(100), { status: 'running' })).status).toBe(409)
    expect((await changeStatus(fake({ pilot: { status: 'draft' } }).store, u(100), { status: 'closed' })).status).toBe(409)
    expect((await changeStatus(fake().store, u(100), { status: 'draft' })).status).toBe(400)
  })
})
