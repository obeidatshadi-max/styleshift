// src/app/api/voice-partner/live-judge/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function mockSupabase(doctor: unknown, userId = 'rep-1') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: doctor }) }) }),
      insert: async () => ({ error: null }),
    }),
  }
}

const request = (body: unknown) => new Request('http://localhost/api/voice-partner/live-judge', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

const doctor = { id: 'd1', style: 'driver' }

describe('POST /api/voice-partner/live-judge', () => {
  it('rejects when not configured', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'false')
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [] }))
    expect(res.status).toBe(503)
  })
  it('rejects unauthenticated requests', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [] }))
    expect(res.status).toBe(401)
  })
  it('rejects an empty (no rep turns) transcript without calling the judge', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [{ role: 'doctor', text: 'Hi' }] }))
    expect(res.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns scored=false when the judge call fails, without erroring the request', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    const res = await POST(request({ doctorId: 'd1', difficulty: 'realistic', transcript: [{ role: 'rep', text: 'Hello doctor' }] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ ok: true, scored: false, turnCount: 1 })
  })
  it('returns the judged result on success', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const anthropicBody = { content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":["listen"]}' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(anthropicBody)))
    const res = await POST(request({
      doctorId: 'd1', difficulty: 'realistic',
      transcript: [{ role: 'doctor', text: 'Too busy.' }, { role: 'rep', text: 'What is eating your time?' }],
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ objectionType: 'doubt', outcome: 'won', clearSteps: ['listen'], turnCount: 1 })
  })
})
