import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => ({}) }))

const store = {
  assignedCases: vi.fn(), myRatings: vi.fn(), turns: vi.fn(), myRating: vi.fn(), saveDraft: vi.fn(), submit: vi.fn(),
}
vi.mock('@/lib/validation/assessor-store', () => ({ supabaseAssessorStore: () => store }))

import { GET as listGET } from './route'
import { GET as caseGET, PUT as casePUT } from './[id]/route'

const ID = '11111111-1111-4111-8111-111111111111'
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (body: unknown) => new Request('http://x', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => {
  process.env.VALIDATION_PILOT_ENABLED = 'true'
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  store.assignedCases.mockResolvedValue([{ assignmentId: ID, scenarioType: 'A' }])
  store.myRatings.mockResolvedValue([])
  store.turns.mockResolvedValue([{ index: 0, role: 'doctor', text: 'hi' }])
  store.myRating.mockResolvedValue(null)
  store.saveDraft.mockResolvedValue({ ratingId: 'r1' })
  store.submit.mockResolvedValue(true)
})
afterEach(() => { vi.clearAllMocks(); delete process.env.VALIDATION_PILOT_ENABLED })

describe('assessor routes', () => {
  it('are invisible (404) while the pilot flag is off, and touch nothing', async () => {
    delete process.env.VALIDATION_PILOT_ENABLED
    expect((await listGET()).status).toBe(404)
    expect((await caseGET(new Request('http://x'), params(ID))).status).toBe(404)
    expect((await casePUT(put({ items: [] }), params(ID))).status).toBe(404)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('need a signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await listGET()).status).toBe(401)
    expect((await casePUT(put({ items: [] }), params(ID))).status).toBe(401)
  })

  it('list the assigned cases, uncached', async () => {
    const res = await listGET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ cases: [{ assignmentId: ID, scenarioType: 'A', ratingStatus: null }] })
  })

  it('return 404 for a malformed case id without querying', async () => {
    expect((await caseGET(new Request('http://x'), params('not-a-uuid'))).status).toBe(404)
    expect(store.assignedCases).not.toHaveBeenCalled()
  })

  it('reject a body that is not an object', async () => {
    expect((await casePUT(put('not json'), params(ID))).status).toBe(400)
    expect((await casePUT(put([1]), params(ID))).status).toBe(400)
  })

  it('save a draft, and treat only submit: true as a submission', async () => {
    const draft = { items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [0] }] }
    expect(await (await casePUT(put({ ...draft, submit: 'yes' }), params(ID))).json()).toEqual({ ratingId: 'r1', status: 'draft' })
    expect(store.submit).not.toHaveBeenCalled()
  })

  it('never show a raw database error: a refused write is 403, anything else 500', async () => {
    const draft = { items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [0] }] }
    store.saveDraft.mockRejectedValueOnce(new Error('new row violates row-level security policy for table "human_ratings"'))
    const refused = await casePUT(put(draft), params(ID))
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: 'not_allowed' })
    store.saveDraft.mockRejectedValueOnce(new Error('connection to 10.0.0.5 refused'))
    const broken = await casePUT(put(draft), params(ID))
    expect(broken.status).toBe(500)
    expect(JSON.stringify(await broken.json())).not.toContain('10.0.0.5')
  })
})
