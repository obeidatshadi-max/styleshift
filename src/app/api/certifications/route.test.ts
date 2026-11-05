import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/team-stats', () => ({ getTeamStatsForUser: vi.fn() }))
vi.mock('@/lib/certification-service', () => ({
  overview: vi.fn(async () => ({ status: 200, body: { reps: [] } })),
  issue: vi.fn(async () => ({ status: 201, body: { certificate: { id: 'c' } } })),
  revoke: vi.fn(async () => ({ status: 200, body: { certificate: { id: 'c' } } })),
}))
import { GET, PATCH, POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { issue, revoke } from '@/lib/certification-service'

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
const as = (user: unknown) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never)
const post = (body: unknown) => new Request('http://localhost/api/certifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('/api/certifications', () => {
  it('does not exist while the feature is off', async () => {
    as({ id: 'm' })
    expect((await GET()).status).toBe(404)
    expect((await POST(post({}))).status).toBe(404)
    expect((await PATCH(post({}))).status).toBe(404)
  })

  it('needs a signed-in manager', async () => {
    vi.stubEnv('CERTIFICATION_ENABLED', 'true')
    as(null)
    expect((await GET()).status).toBe(401)
    as({ id: 'rep' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
    expect((await POST(post({ repId: 'x' }))).status).toBe(403)
    expect((await PATCH(post({ id: 'x', reason: 'y' }))).status).toBe(403)
    expect(issue).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it('lets a manager read, issue and revoke, taking the manager id from the session and not from the body', async () => {
    vi.stubEnv('CERTIFICATION_ENABLED', 'true')
    as({ id: 'mgr-1' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue({ companyId: 'co', companyName: 'C', reps: [] } as never)
    expect((await GET()).status).toBe(200)
    const created = await POST(post({ repId: 'r', programName: 'p', issued_by: 'attacker' }))
    expect(created.status).toBe(201)
    expect(vi.mocked(issue).mock.calls[0][1]).toBe('mgr-1')
    expect((await PATCH(post({ id: 'c', reason: 'why' }))).status).toBe(200)
    expect(vi.mocked(revoke).mock.calls[0][1]).toBe('mgr-1')
  })

  it('rejects a body that is not an object', async () => {
    vi.stubEnv('CERTIFICATION_ENABLED', 'true')
    as({ id: 'mgr-1' })
    vi.mocked(getTeamStatsForUser).mockResolvedValue({ companyId: 'co', companyName: 'C', reps: [] } as never)
    expect((await POST(post([1]))).status).toBe(400)
    expect((await POST(new Request('http://localhost/api/certifications', { method: 'POST', body: 'not json' }))).status).toBe(400)
  })
})
