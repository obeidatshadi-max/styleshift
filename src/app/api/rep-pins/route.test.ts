import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/team-stats', () => ({ getTeamStatsForUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }))
vi.mock('@/lib/rep-pin-service', () => ({
  listReps: vi.fn(async () => ({ status: 200, body: { reps: [] } })),
  resetPin: vi.fn(async (_db: unknown, _m: string, _s: unknown, _id: unknown, pin: string) => ({ status: 200, body: { pin } })),
}))
import { GET, POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { checkRateLimit } from '@/lib/rate-limit'
import { resetPin } from '@/lib/rep-pin-service'

afterEach(() => vi.clearAllMocks())
const as = (user: unknown) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never)
const post = (body: unknown) => new Request('http://localhost/api/rep-pins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('/api/rep-pins', () => {
  it('needs a signed-in manager', async () => {
    as(null)
    expect((await GET()).status).toBe(401)
    expect((await POST(post({ repId: 'r' }))).status).toBe(401)
    as({ id: 'rep' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
    expect((await POST(post({ repId: 'r' }))).status).toBe(403)
    expect(resetPin).not.toHaveBeenCalled()
  })

  it('resets with a fresh random 6-digit PIN, as the signed-in manager, and the PIN is never cached', async () => {
    as({ id: 'mgr-1' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue({ companyId: 'co', reps: [] } as never)
    const res = await POST(post({ repId: 'r1', managerId: 'attacker', pin: '000000' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const call = vi.mocked(resetPin).mock.calls[0]
    expect(call[1]).toBe('mgr-1')
    expect(call[3]).toBe('r1')
    expect(call[4]).toMatch(/^\d{6}$/)
    expect(call[4]).not.toBe('000000')
  })

  it('limits how often one manager can reset', async () => {
    as({ id: 'mgr-1' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue({ companyId: 'co', reps: [] } as never)
    vi.mocked(checkRateLimit).mockResolvedValueOnce(false)
    expect((await POST(post({ repId: 'r1' }))).status).toBe(429)
    expect(resetPin).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    as({ id: 'mgr-1' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue({ companyId: 'co', reps: [] } as never)
    expect((await POST(new Request('http://localhost/api/rep-pins', { method: 'POST', body: 'nope' }))).status).toBe(400)
  })
})
