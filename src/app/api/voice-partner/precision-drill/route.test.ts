import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function mockSupabase(doctor: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({
        single: async () => ({ data: doctor }),
        order: () => ({ limit: async () => ({ data: [] }) }),
      }) }),
    }),
  }
}

const request = (body: unknown) => new Request('http://localhost/api/voice-partner/precision-drill', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const doctor = { id: 'd1', name: 'Dr. Salim', style: 'analytical', specialty: null, key_phrases: null, objections: [] }
const configured = () => {
  vi.stubEnv('AI_VOICE_PARTNER_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
  vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
}
const model = (text: string) => vi.fn().mockResolvedValue(Response.json({ content: [{ text }] }))

describe('POST /api/voice-partner/precision-drill', () => {
  it('reports not configured without the feature flag', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_ENABLED', 'false')
    expect((await POST(request({ action: 'line', doctorId: 'd1' }))).status).toBe(503)
  })
  it('rejects unauthenticated requests', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await POST(request({ action: 'line', doctorId: 'd1' }))).status).toBe(401)
  })
  it('rate limits', async () => {
    configured(); vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await POST(request({ action: 'line', doctorId: 'd1' }))).status).toBe(429)
  })
  it('returns a vague line for a pattern not used yet', async () => {
    configured(); vi.stubGlobal('fetch', model('{"doctorLine":"Patients do not like it."}'))
    const used = ['deletion', 'unspecified_referent', 'unspecified_verb', 'nominalization', 'impossibility', 'cause_effect', 'presupposition']
    const res = await POST(request({ action: 'line', doctorId: 'd1', usedPatterns: used }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ pattern: 'missing_comparison', doctorLine: 'Patients do not like it.' })
  })
  it('judges the rep question and never calls the model on a bad request', async () => {
    configured()
    const fetcher = model('{"verdict":"specifying","doctorText":"Mostly my older patients on several medicines."}')
    vi.stubGlobal('fetch', fetcher)
    const missing = await POST(request({ action: 'judge', doctorId: 'd1', pattern: 'unspecified_referent', doctorLine: 'Patients do not like it.' }))
    expect(missing.status).toBe(400)
    const tooLong = await POST(request({ action: 'judge', doctorId: 'd1', pattern: 'unspecified_referent', doctorLine: 'x', repQuestion: 'a'.repeat(401) }))
    expect(tooLong.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
    const res = await POST(request({ action: 'judge', doctorId: 'd1', pattern: 'unspecified_referent', doctorLine: 'Patients do not like it.', repQuestion: 'Which patients, specifically?' }))
    expect(await res.json()).toEqual({ verdict: 'specifying', doctorText: 'Mostly my older patients on several medicines.' })
  })
  it('returns 422 when the model reply is unusable', async () => {
    configured(); vi.stubGlobal('fetch', model('{"verdict":"great job"}'))
    const res = await POST(request({ action: 'judge', doctorId: 'd1', pattern: 'deletion', doctorLine: 'I have concerns.', repQuestion: 'About what?' }))
    expect(res.status).toBe(422)
  })
})
