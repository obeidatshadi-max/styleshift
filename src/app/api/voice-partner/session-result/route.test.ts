import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }))
vi.mock('@/lib/voice-partner-auth', () => ({ authenticateVoicePartnerRequest: vi.fn(async () => ({ userId: 'rep-1', viaToken: false })) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { signResultToken } from '@/lib/voice-partner-result-token'

const SESSION = '22222222-2222-4222-8222-222222222222'
let insert: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('AI_VOICE_PARTNER_ENABLED', 'true')
  vi.stubEnv('VOICE_PARTNER_RESULT_SECRET', 'test-secret')
  insert = vi.fn(async () => ({ error: null }))
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'd1', style: 'driver' } }) }) }) }),
      insert,
    }),
  } as never)
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

const judged = { userId: 'rep-1', doctorId: 'd1', sessionId: SESSION, objectionType: 'doubt' as const, outcome: 'escalated' as const, turnCount: 3, clearSteps: ['listen' as const] }
const post = (body: unknown) => POST(new Request('http://localhost/api/voice-partner/session-result', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))
const bodyFor = (overrides: Record<string, unknown> = {}) => ({
  doctorId: 'd1', sessionId: SESSION, objectionType: 'doubt', outcome: 'escalated', clearSteps: ['listen'], turnCount: 3,
  resultToken: signResultToken(judged), ...overrides,
})

describe('POST /api/voice-partner/session-result', () => {
  it('stores a result the judge signed, using the signed values', async () => {
    const res = await post(bodyFor())
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: SESSION, outcome: 'escalated', turn_count: 3, clear_steps_hit: ['listen'] }))
  })
  it('refuses a hand-written win with no judged session behind it', async () => {
    const res = await post(bodyFor({ outcome: 'won', resultToken: undefined }))
    expect(res.status).toBe(403)
    expect(insert).not.toHaveBeenCalled()
  })
  it('refuses a real token whose result was edited (escalated -> won, more CLEAR steps)', async () => {
    expect((await post(bodyFor({ outcome: 'won' }))).status).toBe(403)
    expect((await post(bodyFor({ clearSteps: ['listen', 'clarify'] }))).status).toBe(403)
    expect((await post(bodyFor({ turnCount: 2 }))).status).toBe(403)
    expect(insert).not.toHaveBeenCalled()
  })
  it('refuses a token for another rep, doctor or session', async () => {
    expect((await post(bodyFor({ resultToken: signResultToken({ ...judged, userId: 'rep-2' }) }))).status).toBe(403)
    expect((await post(bodyFor({ resultToken: signResultToken({ ...judged, doctorId: 'd2' }) }))).status).toBe(403)
    expect((await post(bodyFor({ sessionId: '33333333-3333-4333-8333-333333333333' }))).status).toBe(403)
  })
  it('refuses a forged or expired token', async () => {
    expect((await post(bodyFor({ resultToken: signResultToken(judged, 'wrong-secret') }))).status).toBe(403)
    expect((await post(bodyFor({ resultToken: signResultToken(judged, 'test-secret', -1000) }))).status).toBe(403)
  })
  it('accepts CLEAR steps in any order or with repeats, as the client merges them', async () => {
    const token = signResultToken({ ...judged, clearSteps: ['listen', 'clarify'] })
    expect((await post(bodyFor({ clearSteps: ['clarify', 'listen', 'listen'], resultToken: token }))).status).toBe(200)
  })
})
