import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/improvement/server', () => ({
  getRepReport: vi.fn(), getManagerBoard: vi.fn(), createFollowup: vi.fn(),
  acknowledgeFollowup: vi.fn(), closeFollowup: vi.fn(), addFieldCheck: vi.fn(),
}))

import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import * as server from '@/lib/improvement/server'
import { GET as getReport } from './route'
import { GET as getBoard } from './board/route'
import { PATCH as patchFollowup, POST as postFollowup } from './followups/route'
import { POST as postCheck } from './field-checks/route'

const ID = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'
const signedIn = (id: string | null) => vi.mocked(createClient).mockResolvedValue(
  { auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never)
const json = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

afterEach(() => { vi.clearAllMocks(); vi.mocked(checkRateLimit).mockResolvedValue(true) })

describe('authentication on every improvement route', () => {
  it('returns 401 when signed out and never touches data', async () => {
    signedIn(null)
    const responses = await Promise.all([
      getReport(), getBoard(),
      postFollowup(json({})), patchFollowup(json({})), postCheck(json({})),
    ])
    expect(responses.map(r => r.status)).toEqual([401, 401, 401, 401, 401])
    expect(server.getRepReport).not.toHaveBeenCalled()
    expect(server.createFollowup).not.toHaveBeenCalled()
  })
})

describe('GET routes', () => {
  it('returns the signed-in rep own report, keyed by the session user and not by any request input', async () => {
    signedIn('rep-1')
    vi.mocked(server.getRepReport).mockResolvedValue({ report: { caveats: [] }, followups: [] } as never)
    expect((await getReport()).status).toBe(200)
    expect(server.getRepReport).toHaveBeenCalledWith('rep-1')
  })
  it('returns 403 on the manager board for a non-manager', async () => {
    signedIn('rep-1')
    vi.mocked(server.getManagerBoard).mockResolvedValue(null)
    expect((await getBoard()).status).toBe(403)
  })
})

describe('POST /followups', () => {
  const body = { repId: ID, drillKind: 'precision_drill', metricKey: 'open_question_ratio' }
  it('rejects invalid input with 400 before calling the data layer', async () => {
    signedIn('mgr-1'); vi.mocked(checkRateLimit).mockResolvedValue(true)
    expect((await postFollowup(json({ ...body, metricKey: 'win_rate' }))).status).toBe(400)
    expect(server.createFollowup).not.toHaveBeenCalled()
  })
  it('maps forbidden to 403 and success to 200', async () => {
    signedIn('mgr-1'); vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.mocked(server.createFollowup).mockResolvedValueOnce({ ok: false, error: 'forbidden' })
    expect((await postFollowup(json(body))).status).toBe(403)
    vi.mocked(server.createFollowup).mockResolvedValueOnce({ ok: true, id: 'f1', existing: false })
    const ok = await postFollowup(json(body))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ id: 'f1', existing: false })
  })
  it('returns 429 when rate limited', async () => {
    signedIn('mgr-1'); vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await postFollowup(json(body))).status).toBe(429)
  })
})

describe('PATCH /followups and POST /field-checks', () => {
  it('validates the action and id', async () => {
    signedIn('u'); vi.mocked(checkRateLimit).mockResolvedValue(true)
    expect((await patchFollowup(json({ id: ID, action: 'delete' }))).status).toBe(400)
    expect((await patchFollowup(json({ id: 'x', action: 'close' }))).status).toBe(400)
  })
  it('maps data-layer results to 200 / 403 / 404', async () => {
    signedIn('u'); vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.mocked(server.closeFollowup).mockResolvedValueOnce('ok')
    expect((await patchFollowup(json({ id: ID, action: 'close' }))).status).toBe(200)
    vi.mocked(server.acknowledgeFollowup).mockResolvedValueOnce('forbidden')
    expect((await patchFollowup(json({ id: ID, action: 'acknowledge' }))).status).toBe(403)
    vi.mocked(server.addFieldCheck).mockResolvedValueOnce('not_found')
    expect((await postCheck(json({ followupId: ID, kind: 'verified', observed: 'seen' }))).status).toBe(404)
  })
  it('passes the session user as the author and never a client-supplied author', async () => {
    signedIn('mgr-1'); vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.mocked(server.addFieldCheck).mockResolvedValueOnce('ok')
    await postCheck(json({ followupId: ID, kind: 'verified', observed: 'seen', recordedBy: 'rep-1' }))
    expect(server.addFieldCheck).toHaveBeenCalledWith('mgr-1', { followupId: ID, kind: 'verified', observed: 'seen', note: null })
  })
  it('rejects a malformed field check', async () => {
    signedIn('u'); vi.mocked(checkRateLimit).mockResolvedValue(true)
    expect((await postCheck(json({ followupId: ID, kind: 'trusted', observed: 'seen' }))).status).toBe(400)
  })
})
