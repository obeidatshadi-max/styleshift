import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
const m = vi.hoisted(() => ({ client: vi.fn(), limit: vi.fn(), complete: vi.fn(), factory: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: m.client }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: m.limit }))
vi.mock('@/lib/ihia/provider', () => ({ suggestionCompletion: m.factory }))
const request = (body: unknown) => new Request('http://localhost/api/ihia/suggest', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.stubEnv('IHIA_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only')
  m.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } })
  m.limit.mockResolvedValue(true); m.factory.mockReturnValue(m.complete)
  m.complete.mockResolvedValue(JSON.stringify({ suggestions: [{ expression: 'ما عندي وكت', literal_meaning: 'I have no time',
    contextual_meaning: 'Possible time concern', specialty: 'general', kind: 'workflow', uncertainty: 'Confirm context', example: 'ما عندي وكت هسه.' }] }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
describe('IHIA suggestion endpoint', () => {
  it('works without an expression or situation and never writes knowledge', async () => {
    const res = await POST(request({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'unverified', suggestions: [{ review_status: 'unverified' }] })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(m.limit).toHaveBeenCalledWith('ihia-suggest', 'u', 10, 3600)
    expect(m.complete.mock.calls[0][0].prompt).toContain('Common respectful workplace')
  })
  it('requires an enabled feature and a session before a model call', async () => {
    vi.stubEnv('IHIA_ENABLED', 'false')
    expect((await POST(request({}))).status).toBe(404)
    vi.stubEnv('IHIA_ENABLED', 'true')
    m.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    expect((await POST(request({}))).status).toBe(401)
    expect(m.complete).not.toHaveBeenCalled()
  })
  it.each([null, [], { situation: 'x'.repeat(1001) }, { situation: 123 }, { region: 'unknown' }])('rejects invalid requests', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(m.complete).not.toHaveBeenCalled()
  })
  it('rate limits and handles missing configuration', async () => {
    m.limit.mockResolvedValue(false)
    expect((await POST(request({}))).status).toBe(429)
    m.limit.mockResolvedValue(true); m.factory.mockReturnValue(null)
    expect((await POST(request({}))).status).toBe(503)
    expect(m.complete).not.toHaveBeenCalled()
  })
  it('returns a bounded error on failure, never raw provider details', async () => {
    m.complete.mockRejectedValue(new Error('sensitive provider diagnostic'))
    const res = await POST(request({ situation: 'Busy doctor' }))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('sensitive')
  })
})
