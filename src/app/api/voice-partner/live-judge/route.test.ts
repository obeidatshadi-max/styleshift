// src/app/api/voice-partner/live-judge/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function mockSupabase(doctor: unknown, userId = 'rep-1', insert = vi.fn(async (_rows: unknown) => ({ error: null }))) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: doctor }) }) }),
      insert,
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

  // --- live difficulty vocabulary (C1) ---
  it.each(['supportive', 'realistic', 'challenging'])('accepts the live difficulty level %s', async difficulty => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":[]}' }] })))
    const res = await POST(request({ doctorId: 'd1', difficulty, transcript: [{ role: 'rep', text: 'Hello doctor' }] }))
    expect(res.status).toBe(200)
  })
  it.each(['resistant', 'pressure_test', 'nonsense'])('rejects %s, which the live agent has no level for', async difficulty => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const res = await POST(request({ doctorId: 'd1', difficulty, transcript: [{ role: 'rep', text: 'Hello doctor' }] }))
    expect(res.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  // --- lang threading (I7) ---
  it('judges in Arabic when lang: ar is supplied', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn().mockResolvedValue(Response.json({ content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":[]}' }] }))
    vi.stubGlobal('fetch', fetcher)
    await POST(request({ doctorId: 'd1', lang: 'ar', transcript: [{ role: 'rep', text: 'Hello doctor' }] }))
    const prompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content
    expect(prompt).toContain('Iraqi Arabic')
  })
  it('defaults the judge prompt to English when lang is omitted', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn().mockResolvedValue(Response.json({ content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":[]}' }] }))
    vi.stubGlobal('fetch', fetcher)
    await POST(request({ doctorId: 'd1', transcript: [{ role: 'rep', text: 'Hello doctor' }] }))
    const prompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content
    expect(prompt).toContain('Write ALL text in English')
  })
  it('rejects an unsupported lang', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect((await POST(request({ doctorId: 'd1', lang: 'fr', transcript: [{ role: 'rep', text: 'Hi' }] }))).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  // --- client-supplied sessionId (C2) ---
  it('backfills conversation_turns under the client-supplied sessionId', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    const insert = vi.fn(async (_rows: unknown) => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor, 'rep-1', insert) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":[]}' }] })))
    const sessionId = '11111111-2222-4333-8444-555555555555'
    await POST(request({ doctorId: 'd1', sessionId, transcript: [{ role: 'doctor', text: 'Too busy.' }, { role: 'rep', text: 'Understood.' }] }))
    const rows = insert.mock.calls[0][0] as unknown as { session_id: string; turn_index: number }[]
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.session_id === sessionId)).toBe(true)
  })
  it('falls back to a generated sessionId when the client sends none', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    const insert = vi.fn(async (_rows: unknown) => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor, 'rep-1', insert) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: [{ text: '{"objectionType":"doubt","outcome":"won","clearSteps":[]}' }] })))
    await POST(request({ doctorId: 'd1', transcript: [{ role: 'rep', text: 'Understood.' }] }))
    const rows = insert.mock.calls[0][0] as unknown as { session_id: string }[]
    expect(rows[0].session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })
  it('rejects a malformed sessionId rather than writing it as a row id', async () => {
    vi.stubEnv('AI_VOICE_PARTNER_LIVE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.mocked(createClient).mockResolvedValue(mockSupabase(doctor) as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect((await POST(request({ doctorId: 'd1', sessionId: 'not-a-uuid', transcript: [{ role: 'rep', text: 'Hi' }] }))).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
