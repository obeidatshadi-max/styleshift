import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
const service = vi.hoisted(() => ({
  listForManager: vi.fn(), createSimScenario: vi.fn(), assignScenario: vi.fn(), listAssignedForRep: vi.fn(),
  setSimScenarioStatus: vi.fn(),
}))
vi.mock('@/lib/sim-scenarios', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sim-scenarios')>('@/lib/sim-scenarios')
  return { ...actual, ...service }
})

import * as list from './route'
import * as mineRoute from './mine/route'
import * as idRoute from './[id]/route'
import * as assignRoute from './[id]/assign/route'
import { createClient } from '@/lib/supabase-server'

// Handlers are typed loosely (their early-return branches); every call below resolves to a Response.
const call = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => Promise.resolve(fn(...a)) as Promise<Response>
const GET = call(list.GET), POST = call(list.POST), mine = call(mineRoute.GET), PATCH = call(idRoute.PATCH), assign = call(assignRoute.POST)

const ID = '11111111-1111-4111-8111-111111111111'
const login = (id: string | null) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never)
const json = (body: unknown) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.stubEnv('SCENARIO_BUILDER_ENABLED', 'true'))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('sim-scenario routes', () => {
  it('look like missing routes when the flag is off, for every verb', async () => {
    vi.stubEnv('SCENARIO_BUILDER_ENABLED', 'false')
    login('m')
    expect((await GET()).status).toBe(404)
    expect((await POST(json({}))).status).toBe(404)
    expect((await mine()).status).toBe(404)
    expect(service.listForManager).not.toHaveBeenCalled()
  })

  it('require a signed-in user', async () => {
    login(null)
    expect((await GET()).status).toBe(401)
    expect((await mine()).status).toBe(401)
  })

  it('pass the service result through, using the error status from the service', async () => {
    login('m')
    service.listForManager.mockResolvedValue({ ok: true, value: [{ id: 'a' }] })
    expect(await (await GET()).json()).toEqual([{ id: 'a' }])
    service.createSimScenario.mockResolvedValue({ ok: false, status: 403, errors: ['not a manager'] })
    const res = await POST(json({ name: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ errors: ['not a manager'] })
  })

  it('rejects a body that is not JSON before calling the service', async () => {
    login('m')
    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: 'nope' }))
    expect(res.status).toBe(400)
    expect(service.createSimScenario).not.toHaveBeenCalled()
  })

  it('validates ids and statuses', async () => {
    login('m')
    expect((await PATCH(json({ status: 'approved' }), params('not-a-uuid'))).status).toBe(400)
    expect((await PATCH(json({ status: 'published' }), params(ID))).status).toBe(400)
    service.setSimScenarioStatus.mockResolvedValue({ ok: true, value: { id: ID, status: 'approved' } })
    expect((await PATCH(json({ status: 'approved' }), params(ID))).status).toBe(200)
    expect(service.setSimScenarioStatus).toHaveBeenCalledWith('m', ID, 'approved')
  })

  it('requires repId to be a uuid or null when assigning', async () => {
    login('m')
    expect((await assign(json({}), params(ID))).status).toBe(400)
    expect((await assign(json({ repId: 'bob' }), params(ID))).status).toBe(400)
    service.assignScenario.mockResolvedValue({ ok: true, value: { id: 'a' } })
    expect((await assign(json({ repId: null }), params(ID))).status).toBe(200)
    expect(service.assignScenario).toHaveBeenCalledWith('m', ID, null, null)
  })

  it('shows reps only the fields needed to pick a scenario (no hidden concern, coach notes or objections)', async () => {
    login('rep')
    service.listAssignedForRep.mockResolvedValue([{
      id: 's1', name: 'N', description: 'D', therapeuticArea: 'CV', difficulty: 'normal', language: 'en', availableTimeMin: 5,
      physician: { specialty: 'cardiology', style: 'driver' }, visitPurpose: 'Intro',
      hiddenConcern: 'SECRET', coachInstructions: 'COACH ONLY', requiredObjections: [{ type: 'doubt' }], mainConcerns: ['x'],
    }])
    const body = await (await mine()).json()
    expect(Object.keys(body[0]).sort()).toEqual(['availableTimeMin', 'description', 'difficulty', 'id', 'language', 'name', 'specialty', 'style', 'therapeuticArea', 'visitPurpose'])
    expect(JSON.stringify(body)).not.toMatch(/SECRET|COACH ONLY/)
  })
})
