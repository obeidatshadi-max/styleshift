import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => ({}) }))
const teamStats = vi.fn()
vi.mock('@/lib/team-stats', () => ({ getTeamStatsForUser: (id: string) => teamStats(id) }))

const store = {
  myPilots: vi.fn(), pilot: vi.fn(), createPilot: vi.fn(), members: vi.fn(), people: vi.fn(), profile: vi.fn(),
  addMember: vi.fn(), cases: vi.fn(), sessionBelongsToRep: vi.fn(), addCase: vi.fn(), setStatus: vi.fn(),
}
vi.mock('@/lib/validation/pilot-admin-store', () => ({ supabasePilotAdminStore: () => store }))

import { GET as listGET, POST as createPOST } from './route'
import { GET as pilotGET } from './[id]/route'
import { POST as statusPOST } from './[id]/status/route'
import { POST as casePOST } from './[id]/cases/route'
import { POST as memberPOST } from './[id]/members/route'

const ID = '11111111-1111-4111-8111-111111111111'
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => {
  process.env.VALIDATION_PILOT_ENABLED = 'true'
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  teamStats.mockResolvedValue({ companyId: 'co1' })
  store.myPilots.mockResolvedValue([])
  store.pilot.mockResolvedValue(null)
  store.createPilot.mockResolvedValue({ id: ID })
})
afterEach(() => { vi.clearAllMocks(); delete process.env.VALIDATION_PILOT_ENABLED })

describe('pilot administration routes', () => {
  it('are invisible while the flag is off, and touch nothing', async () => {
    delete process.env.VALIDATION_PILOT_ENABLED
    expect((await listGET()).status).toBe(404)
    expect((await createPOST(post({}))).status).toBe(404)
    expect((await statusPOST(post({}), params(ID))).status).toBe(404)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('need a signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await listGET()).status).toBe(401)
    expect((await casePOST(post({}), params(ID))).status).toBe(401)
  })

  it('create a pilot for the caller\'s own company, ignoring any company in the body', async () => {
    const res = await createPOST(post({ name: 'P', dataSource: 'synthetic', companyId: 'someone-elses' }))
    expect(res.status).toBe(201)
    expect(store.createPilot).toHaveBeenCalledWith({ companyId: 'co1', name: 'P', dataSource: 'synthetic' })
  })

  it('refuse a caller who manages no company', async () => {
    teamStats.mockResolvedValue(null)
    expect((await createPOST(post({ name: 'P', dataSource: 'synthetic' }))).status).toBe(403)
    expect(store.createPilot).not.toHaveBeenCalled()
  })

  it('treat a pilot the caller does not administer as not found, on every action', async () => {
    store.pilot.mockResolvedValue(null)
    expect((await pilotGET(new Request('http://x'), params(ID))).status).toBe(404)
    expect((await statusPOST(post({ status: 'running' }), params(ID))).status).toBe(404)
    expect((await casePOST(post({}), params(ID))).status).toBe(404)
    expect((await memberPOST(post({}), params(ID))).status).toBe(404)
    expect(store.setStatus).not.toHaveBeenCalled()
    expect(store.addCase).not.toHaveBeenCalled()
    expect(store.addMember).not.toHaveBeenCalled()
  })

  it('return 404 for a malformed pilot id without asking the store', async () => {
    expect((await pilotGET(new Request('http://x'), params('nope'))).status).toBe(404)
    expect(store.pilot).not.toHaveBeenCalled()
  })

  it('never show a raw database error', async () => {
    store.createPilot.mockRejectedValueOnce(new Error('connection to 10.0.0.5 refused'))
    const res = await createPOST(post({ name: 'P', dataSource: 'synthetic' }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.5')
  })
})
