// src/app/api/reports/generate/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const request = (body: unknown) => new Request('http://localhost/api/reports/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

function mockSupabaseForRoleplay(userId = 'rep-1') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table: string) => {
      if (table === 'roleplay_sessions') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { rep_id: userId, talk_ratio: 0.5, rapid_turn_switches: 1, question_ratio: 0.3, open_question_ratio: 0.5, paraphrase_score: 0.4, active_listening_score: 60, rep_style: 'driver', partner_style: 'analytical', adaptation_score: 50 }, error: null }) }) }) }) }
      if (table === 'transcript_segments') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [{ segment_index: 0, speaker_role: 'rep', text: 'Hello there, thanks for your time today.', start_ms: 0, end_ms: 2000 }], error: null }) }) }) }) }) }
      if (table === 'conversation_reports') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'report-1' }, error: null }) }) }), update: () => ({ eq: () => ({ eq: () => ({ lt: async () => ({ error: null }) }) }) }) }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

describe('POST /api/reports/generate', () => {
  it('rejects unauthenticated requests', async () => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1' }))
    expect(res.status).toBe(401)
  })
  it('rejects an unknown sessionType', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRoleplay() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ sessionType: 'nonsense', sessionId: 's1' }))
    expect(res.status).toBe(400)
  })
  it('returns 502 (never a fabricated report) when the model call fails', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRoleplay() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1' }))
    expect(res.status).toBe(502)
  })
})
