import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
const svc = vi.hoisted(() => ({
  listMethodologies: vi.fn(), createMethodology: vi.fn(), updateMethodology: vi.fn(), setMethodologyStatus: vi.fn(), getMethodology: vi.fn(), activeMethodologyFor: vi.fn(),
}))
vi.mock('@/lib/methodologies', async () => ({ ...(await vi.importActual<typeof import('@/lib/methodologies')>('@/lib/methodologies')), ...svc }))
vi.mock('@/lib/challenge-load', async () => ({ ...(await vi.importActual<typeof import('@/lib/challenge-load')>('@/lib/challenge-load')), loadChallengeData: vi.fn(async () => ({ events: [{ behavior: 'clarification' }, { behavior: 'premature_pitch' }], sessionIds: ['s1', 's2'], targeted: new Map() })) }))

import * as listRoute from './route'
import * as idRoute from './[id]/route'
import * as activeRoute from './active/route'
import * as progressRoute from '../progress/methodology/route'
import { createClient } from '@/lib/supabase-server'
import { validateMethodology } from '@/schemas/methodology'

const call = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => Promise.resolve(fn(...a)) as Promise<Response>
const GET = call(listRoute.GET), POST = call(listRoute.POST), PUT = call(idRoute.PUT), PATCH = call(idRoute.PATCH), ACTIVE = call(activeRoute.GET), PROGRESS = call(progressRoute.GET)
const ID = '11111111-1111-4111-8111-111111111111'
const login = (id: string | null) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never)
const json = (b: unknown) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.stubEnv('METHODOLOGY_BUILDER_ENABLED', 'true'))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('methodology routes', () => {
  it('look like missing routes when the flag is off', async () => {
    vi.stubEnv('METHODOLOGY_BUILDER_ENABLED', 'false'); login('m')
    for (const res of [await GET(), await POST(json({})), await ACTIVE(), await PROGRESS()]) expect(res.status).toBe(404)
    expect(svc.listMethodologies).not.toHaveBeenCalled()
  })

  it('need a signed-in user', async () => {
    login(null)
    expect((await GET()).status).toBe(401)
    expect((await ACTIVE()).status).toBe(401)
    expect((await PROGRESS()).status).toBe(401)
  })

  it('pass service errors through with their status and reject bad ids, bodies and statuses', async () => {
    login('m')
    svc.createMethodology.mockResolvedValue({ ok: false, status: 403, errors: ['not a manager'] })
    const res = await POST(json({ name: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ errors: ['not a manager'] })
    expect((await POST(new Request('http://localhost/x', { method: 'POST', body: 'no' }))).status).toBe(400)
    expect((await PUT(json({}), params('nope'))).status).toBe(400)
    expect((await PATCH(json({ status: 'live' }), params(ID))).status).toBe(400)
    svc.setMethodologyStatus.mockResolvedValue({ ok: true, value: { id: ID, status: 'active' } })
    expect((await PATCH(json({ status: 'active' }), params(ID))).status).toBe(200)
    expect(svc.setMethodologyStatus).toHaveBeenCalledWith('m', ID, 'active')
  })

  it('serve the active methodology to any signed-in member', async () => {
    login('rep'); svc.activeMethodologyFor.mockResolvedValue({ name: 'Mine' })
    expect(await (await ACTIVE()).json()).toEqual({ methodology: { name: 'Mine' } })
    expect(svc.activeMethodologyFor).toHaveBeenCalledWith('rep')
  })

  it('show recent practice against the company stages, with no score', async () => {
    login('rep')
    const m = validateMethodology({ name: 'M', stages: [{ id: 'a', order: 1, name: { en: 'A' }, expectedBehaviors: ['clarification'], prohibitedBehaviors: ['premature_pitch'], weight: 1 }] })
    if (!m.ok) throw new Error(m.errors.join())
    svc.activeMethodologyFor.mockResolvedValue(m.value)
    const body = await (await PROGRESS()).json()
    expect(body.sessionsConsidered).toBe(2)
    expect(body.stages[0]).toMatchObject({ stageId: 'a', status: 'needs_attention', expectedSeen: ['clarification'], prohibitedSeen: ['premature_pitch'] })
    expect(JSON.stringify(body)).not.toMatch(/score/i)
    svc.activeMethodologyFor.mockResolvedValue(null)
    expect(await (await PROGRESS()).json()).toEqual({ methodology: null })
  })
})
