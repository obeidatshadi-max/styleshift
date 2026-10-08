import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
const svc = vi.hoisted(() => ({
  listPacks: vi.fn(), createPack: vi.fn(), updatePack: vi.fn(), setPackStatus: vi.fn(), getPack: vi.fn(),
}))
vi.mock('@/lib/knowledge-packs', async () => ({ ...(await vi.importActual<typeof import('@/lib/knowledge-packs')>('@/lib/knowledge-packs')), ...svc }))

import * as listRoute from './route'
import * as idRoute from './[id]/route'
import { createClient } from '@/lib/supabase-server'

const call = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => Promise.resolve(fn(...a)) as Promise<Response>
const GET = call(listRoute.GET), POST = call(listRoute.POST), GET_ONE = call(idRoute.GET), PUT = call(idRoute.PUT), PATCH = call(idRoute.PATCH)
const ID = '11111111-1111-4111-8111-111111111111'
const login = (id: string | null) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never)
const json = (b: unknown) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.stubEnv('KNOWLEDGE_PACKS_ENABLED', 'true'))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('knowledge pack routes', () => {
  it('look like missing routes when the flag is off', async () => {
    vi.stubEnv('KNOWLEDGE_PACKS_ENABLED', 'false'); login('m')
    for (const res of [await GET(), await POST(json({})), await GET_ONE(json({}), params(ID)), await PUT(json({}), params(ID)), await PATCH(json({ status: 'draft' }), params(ID))]) {
      expect(res.status).toBe(404)
    }
    expect(svc.listPacks).not.toHaveBeenCalled()
  })

  it('need a signed-in user', async () => {
    login(null)
    expect((await GET()).status).toBe(401)
    expect((await POST(json({}))).status).toBe(401)
  })

  it('pass service errors through with their status', async () => {
    login('rep')
    svc.createPack.mockResolvedValue({ ok: false, status: 403, errors: ['not a manager'] })
    const res = await POST(json({ name: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ errors: ['not a manager'] })
  })

  it('list and read go through the service for the signed-in user', async () => {
    login('m')
    svc.listPacks.mockResolvedValue({ ok: true, value: [{ id: ID }] })
    expect(await (await GET()).json()).toEqual([{ id: ID }])
    expect(svc.listPacks).toHaveBeenCalledWith('m')
    svc.getPack.mockResolvedValue({ ok: false, status: 404, errors: ['knowledge pack not found'] })
    expect((await GET_ONE(json({}), params(ID))).status).toBe(404)
  })

  it('reject bad ids, non-JSON bodies and unknown statuses before calling the service', async () => {
    login('m')
    expect((await POST(new Request('http://localhost/x', { method: 'POST', body: 'no' }))).status).toBe(400)
    expect((await PUT(json({}), params('nope'))).status).toBe(400)
    expect((await GET_ONE(json({}), params('nope'))).status).toBe(400)
    expect((await PATCH(json({ status: 'live' }), params(ID))).status).toBe(400)
    expect(svc.createPack).not.toHaveBeenCalled()
    expect(svc.updatePack).not.toHaveBeenCalled()
    expect(svc.setPackStatus).not.toHaveBeenCalled()
  })

  it('PATCH changes the status and PUT replaces the content', async () => {
    login('m')
    svc.setPackStatus.mockResolvedValue({ ok: true, value: { id: ID, status: 'approved' } })
    expect((await PATCH(json({ status: 'approved' }), params(ID))).status).toBe(200)
    expect(svc.setPackStatus).toHaveBeenCalledWith('m', ID, 'approved')
    svc.updatePack.mockResolvedValue({ ok: true, value: { id: ID } })
    expect((await PUT(json({ name: 'x' }), params(ID))).status).toBe(200)
    expect(svc.updatePack).toHaveBeenCalledWith('m', ID, { name: 'x' })
  })
})
