import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }))
vi.mock('@/lib/voice-partner-auth', () => ({ authenticateVoicePartnerRequest: vi.fn(async () => ({ userId: 'rep-1', viaToken: false })) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'

const SESSION = '22222222-2222-4222-8222-222222222222'
let insert: ReturnType<typeof vi.fn>
let row: unknown

beforeEach(() => {
  vi.stubEnv('AI_VOICE_PARTNER_ENABLED', 'true')
  insert = vi.fn(async () => ({ error: null }))
  row = null
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
      insert,
    }),
  } as never)
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

const post = (body: unknown) => POST(new Request('http://localhost/api/voice-partner/session-result', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))

describe('POST /api/voice-partner/session-result (confirm-only)', () => {
  it('refuses a hand-written win with no judged session, and writes nothing', async () => {
    const res = await post({ doctorId: 'd1', sessionId: SESSION, objectionType: 'doubt', outcome: 'won', clearSteps: ['listen'], turnCount: 3 })
    expect(res.status).toBe(404)
    expect(insert).not.toHaveBeenCalled()
  })
  it('confirms a session the judge stored, reporting the stored outcome, not the posted one', async () => {
    row = { id: SESSION, outcome: 'escalated' }
    const res = await post({ sessionId: SESSION, outcome: 'won' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: 'escalated' })
    expect(insert).not.toHaveBeenCalled()
  })
  it('needs a session id', async () => {
    expect((await post({ outcome: 'won' })).status).toBe(400)
  })
})
