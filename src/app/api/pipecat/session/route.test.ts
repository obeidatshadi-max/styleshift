import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: mocks.createClient }))

let fetchMock: ReturnType<typeof vi.fn>
let query: Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => {
  vi.stubEnv('PIPECAT_CLOUD_PUBLIC_KEY', 'test-key')
  vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true')
  query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.single.mockResolvedValue({ data: { name: 'Doctor', style: 'analytical' } })
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'rep' } } }) },
    from: () => query,
  })
  fetchMock = vi.fn().mockResolvedValue(Response.json({ dailyRoom: 'room', dailyToken: 'token' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const request = (body: unknown) => new Request('http://localhost/api/pipecat/session', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('shared Pipecat session endpoint', () => {
  it.each(['gemini', 'openai'])('forwards %s through the same Cloud interface', async provider => {
    const response = await POST(request({ doctorId: 'doctor', provider, lang: 'en' }))
    expect(response.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('rep_id', 'rep')
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.body.provider).toBe(provider)
    expect(payload.transport).toBe('daily')
    expect(payload.body.lang).toBe('en')
    expect(await response.json()).toMatchObject({ dailyRoom: 'room', dailyToken: 'token' })
  })
  it('lets the agent resolve the default when omitted', async () => {
    await POST(request({ doctorId: 'doctor' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).body).not.toHaveProperty('provider')
  })
  it.each([null, [], { doctorId: 'doctor', provider: 'unknown' }, { doctorId: 'doctor', provider: null },
    { doctorId: 'doctor', difficulty: 'bad' }, { doctorId: 'doctor', lang: 'fr' }])('rejects malformed session data', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('requires authentication', async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    expect((await POST(request({ doctorId: 'doctor' }))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects when PIPECAT_CLOUD_PUBLIC_KEY is not configured', async () => {
    vi.stubEnv('PIPECAT_CLOUD_PUBLIC_KEY', '')
    expect((await POST(request({ doctorId: 'doctor' }))).status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects when AI_VOICE_PARTNER_LIVE_ENABLED is not true even with a public key set', async () => {
    vi.stubEnv('PIPECAT_CLOUD_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'false')
    const res = await POST(request({ doctorId: 'd1' }))
    expect(res.status).toBe(503)
  })
  it('rejects a doctor the user cannot access', async () => {
    query.single.mockResolvedValue({ data: null })
    expect((await POST(request({ doctorId: 'doctor' }))).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not expose provider failure details', async () => {
    fetchMock.mockResolvedValue(Response.json({ secret: 'sensitive' }, { status: 500 }))
    const res = await POST(request({ doctorId: 'doctor' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'pipecat_start_failed' })
  })
  it('handles connection failures', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'))
    expect((await POST(request({ doctorId: 'doctor' }))).status).toBe(502)
  })
})
