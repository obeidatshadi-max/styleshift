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

describe('POST /api/reports/generate: the doctor a colleague played', () => {
  it('reads that doctor from the rep own records only, and never from the session own style read', async () => {
    const lookups: Array<[string, string]> = []
    const base = mockSupabaseForRoleplay('rep-1')
    vi.mocked(createClient).mockResolvedValue({
      ...base,
      from: (table: string) => {
        if (table === 'doctors') return { select: () => ({ eq: (c1: string, v1: string) => ({ eq: (c2: string, v2: string) => ({ maybeSingle: async () => { lookups.push([c1, v1], [c2, v2]); return { data: { style: 'amiable' }, error: null } } }) }) }) }
        if (table === 'roleplay_sessions') {
          const real = base.from(table) as { select: () => { eq: () => { eq: () => { single: () => Promise<{ data: Record<string, unknown> }> } } } }
          return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => { const r = await real.select().eq().eq().single(); return { data: { ...r.data, doctor_id: 'doc-1' }, error: null } } }) }) }) }
        }
        return base.from(table)
      },
    } as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    await POST(request({ sessionType: 'human_partner', sessionId: 's1' }))
    expect(lookups).toEqual([['id', 'doc-1'], ['rep_id', 'rep-1']])
  })
})

describe('POST /api/reports/generate: conversation coach (synthetic fixture, mocked model)', () => {
  async function run(coachReply: string, body: Record<string, unknown> = {}) {
    const { SYNTHETIC_EN, SYNTHETIC_EN_MODEL_OUTPUT } = await import('@/lib/conversation-coach/fixtures')
    const inserted: Array<Record<string, unknown>> = []
    const base = mockSupabaseForRoleplay('rep-1')
    vi.mocked(createClient).mockResolvedValue({
      ...base,
      from: (table: string) => {
        if (table === 'transcript_segments') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: async () => ({
          data: SYNTHETIC_EN.map(s => ({ segment_index: s.segmentIndex, speaker_role: s.speakerRole, text: s.text, start_ms: s.startMs, end_ms: s.endMs })), error: null,
        }) }) }) }) }) }
        if (table === 'conversation_reports') return {
          insert: (row: Record<string, unknown>) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'report-1' }, error: null }) }) } },
          update: () => ({ eq: () => ({ eq: () => ({ lt: async () => ({ error: null }) }) }) }),
        }
        return base.from(table)
      },
    } as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    // Every ordinary report part gets the same small valid object; the coach part gets `coachReply`.
    const part = { visitSummary: { summary: 'A short synthetic visit.', objectiveStatus: 'insufficient_evidence', objectiveStatusReason: '', evidence: [{ segmentIndex: 3 }] },
      coachingPriority: { behavior: 'Clarify first.', betterPhrase: 'Which side effects?', practiceExercise: 'x', successLooksLike: 'y', evidence: [{ segmentIndex: 4 }] },
      strength: { behavior: 'Asked an open question.', evidence: [{ segmentIndex: 2 }] } }
    const prompts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const prompt = JSON.parse(init.body).messages[0].content as string
      prompts.push(prompt)
      const text = prompt.includes('<<<TRANSCRIPT') ? coachReply : JSON.stringify(part)
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) }
    }))
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', lang: 'en', ...body }))
    return { res, json: await res.json(), inserted, prompts, fixture: SYNTHETIC_EN_MODEL_OUTPUT }
  }

  it('adds grounded key moments to the saved report', async () => {
    const { SYNTHETIC_EN_MODEL_OUTPUT } = await import('@/lib/conversation-coach/fixtures')
    const { res, json, inserted } = await run(JSON.stringify(SYNTHETIC_EN_MODEL_OUTPUT))
    expect(res.status).toBe(200)
    expect(json.report.coach.keyMoments).toHaveLength(2)
    expect(json.report.coach.synthetic).toBe(false)
    expect((inserted[0].report as { coach: unknown }).coach).toBeTruthy()
  })

  it('still saves the report when the coach part returns nothing usable, marked insufficient', async () => {
    const { res, json } = await run('not json at all')
    expect(res.status).toBe(200)
    expect(json.report.coach.insufficientEvidence).toBe(true)
    expect(json.report.coach.keyMoments).toEqual([])
    expect(json.report.coach.interaction.available).toBe(true)
  })

  it('passes the partial-visit flag into the coach prompt and the result', async () => {
    const { json, prompts } = await run('{}', { partialRecording: true })
    expect(prompts.some(p => p.includes('ONLY PART of the visit'))).toBe(true)
    expect(json.report.coach.structure.partialRecording).toBe(true)
  })
})
