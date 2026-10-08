import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
const complete = vi.fn()
vi.mock('@/agents/llm', () => ({ createAnthropicComplete: () => complete }))

import { GET } from './route'
import { POST } from './attempt/route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

const REPLY = 'When you say results are mixed, which patients are you thinking of?'

function supabase(rows: unknown[] = [], insert = vi.fn(async (_row: unknown) => ({ error: null }))) {
  return {
    insert,
    client: {
      auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows }) }) }) }), insert }),
    },
  }
}
const post = (body: unknown) => new Request('http://localhost/api/micro-practice/attempt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const analystSays = (behaviors: string[]) => complete.mockResolvedValue(JSON.stringify({ observations: behaviors.map(b => ({
  competency: 'discovery', behavior: b, observation: 'The rep did this.', evidence: [{ turnIndex: 1, quote: REPLY }], direction: 'positive', confidence: 0.9,
})) }))

beforeEach(() => {
  vi.stubEnv('MICRO_PRACTICE_ENABLED', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'key')
  vi.mocked(checkRateLimit).mockResolvedValue(true)
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); complete.mockReset() })

describe('GET /api/micro-practice', () => {
  it('looks like a missing route when the flag is off', async () => {
    vi.stubEnv('MICRO_PRACTICE_ENABLED', 'false')
    expect((await GET(new Request('http://localhost/api/micro-practice'))).status).toBe(404)
  })

  it('lists the 15 English drills with prompts and the rep\'s own history, and falls back to them for an Arabic rep', async () => {
    const row = { drill_id: 'precision-questioning-1', drill_version: 1, rep_id: 'rep-1', attempt_no: 1, created_at: '2026-10-08T01:00:00Z', observed_behaviors: [], score: 80, passed: true, lang: 'en' }
    vi.mocked(createClient).mockResolvedValue(supabase([row]).client as never)
    const en = await (await GET(new Request('http://localhost/api/micro-practice?lang=en'))).json()
    expect(en.drills).toHaveLength(15)
    expect(en.drills.find((d: { id: string }) => d.id === 'precision-questioning-1').history).toMatchObject({ personalBest: 80, completions: 1 })
    expect(en.prompts['precision-questioning-1']).toMatch(/mixed/)
    const ar = await (await GET(new Request('http://localhost/api/micro-practice?lang=ar'))).json()
    expect(en.drillLang).toBe('en')
    // No Arabic drills exist yet: the Arabic rep gets the English library, tagged so the card can say so.
    expect(ar.drills).toHaveLength(15)
    expect(ar.drillLang).toBe('en')
    expect(ar.prompts['precision-questioning-1']).toMatch(/mixed/)
  })
})

describe('POST /api/micro-practice/attempt', () => {
  it('rejects unknown drills, empty and oversized replies, and Arabic for English-only drills', async () => {
    vi.mocked(createClient).mockResolvedValue(supabase().client as never)
    for (const body of [{ drillId: 'nope', response: 'x' }, { drillId: 'precision-questioning-1', response: '' }, { drillId: 'precision-questioning-1', response: 'x'.repeat(1201) }, { drillId: 'precision-questioning-1', response: 'x', lang: 'ar' }]) {
      expect((await POST(post(body))).status).toBe(400)
    }
    expect(complete).not.toHaveBeenCalled()
  })

  it('scores from grounded observations, stores only the derived result, and flags a new personal best', async () => {
    const s = supabase()
    vi.mocked(createClient).mockResolvedValue(s.client as never)
    analystSays(['clarification', 'open_question'])
    const res = await POST(post({ drillId: 'precision-questioning-1', response: REPLY }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ score: 100, passed: true, attemptNo: 1, newPersonalBest: true, personalBest: 100, canRetry: true, hint: null })
    expect(data.feedback.find((f: { behavior: string }) => f.behavior === 'clarification')).toMatchObject({ met: true, quote: REPLY })
    expect(s.insert).toHaveBeenCalledTimes(1)
    const stored = s.insert.mock.calls[0][0] as Record<string, unknown>
    expect(stored).toMatchObject({ rep_id: 'rep-1', drill_id: 'precision-questioning-1', score: 100, passed: true })
    expect(JSON.stringify(stored)).not.toContain(REPLY) // the rep's words are never persisted
  })

  it('does not store or count an attempt that could not be assessed', async () => {
    const s = supabase()
    vi.mocked(createClient).mockResolvedValue(s.client as never)
    complete.mockResolvedValue('not json')
    const res = await POST(post({ drillId: 'precision-questioning-1', response: REPLY }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'could_not_assess' })
    expect(s.insert).not.toHaveBeenCalled()
  })

  it('shows a hint after repeated misses, and stops after the daily retry cap', async () => {
    const todayRow = (n: number) => ({ drill_id: 'precision-questioning-1', drill_version: 1, rep_id: 'rep-1', attempt_no: n, created_at: new Date().toISOString(), observed_behaviors: [], score: 20, passed: false, lang: 'en' })
    vi.mocked(createClient).mockResolvedValue(supabase([todayRow(1)]).client as never)
    analystSays(['open_question'])
    const missed = await (await POST(post({ drillId: 'precision-questioning-1', response: REPLY }))).json()
    expect(missed.passed).toBe(false) // required "clarification" missing
    expect(missed.hint).toMatch(/specific thing/)

    vi.mocked(createClient).mockResolvedValue(supabase([1, 2, 3, 4, 5].map(todayRow)).client as never)
    const res = await POST(post({ drillId: 'precision-questioning-1', response: REPLY }))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'retry_limit' })
  })

  it('requires login and respects the rate limit', async () => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await POST(post({}))).status).toBe(401)
    vi.mocked(createClient).mockResolvedValue(supabase().client as never)
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await POST(post({ drillId: 'precision-questioning-1', response: REPLY }))).status).toBe(429)
  })
})
