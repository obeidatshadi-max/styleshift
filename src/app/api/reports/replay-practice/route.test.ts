import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { groundCoach } from '@/lib/conversation-coach/ground'
import { SYNTHETIC_EN, SYNTHETIC_EN_MODEL_OUTPUT } from '@/lib/conversation-coach/fixtures'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const coach = groundCoach(SYNTHETIC_EN_MODEL_OUTPUT, SYNTHETIC_EN, { lang: 'en', partialRecording: false, transcriptQuality: null, delivery: null })
const req = (body: unknown) => new Request('http://localhost/api/reports/replay-practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** A query-builder stand-in that records every filter and returns `result` at the end of the chain. */
function chain(result: unknown, filters: Array<[string, unknown]>) {
  const c: Record<string, unknown> = {}
  for (const k of ['select', 'in', 'is', 'order', 'like']) c[k] = () => c
  c.eq = (col: string, v: unknown) => { filters.push([col, v]); return c }
  c.limit = async () => result
  c.then = (resolve: (v: unknown) => void) => resolve(result)
  return c
}

function db(report: unknown) {
  const filters: Array<[string, unknown]> = []
  const inserts: Array<Record<string, unknown>> = []
  return { filters, inserts, client: {
    auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
    from: (table: string) => {
      if (table === 'conversation_reports') return chain({ data: report ? [{ report }] : [], error: null }, filters)
      if (table === 'drill_attempts') return { ...chain({ count: 2, error: null }, filters), insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null } } }
      throw new Error(table)
    },
  } }
}

function modelReturns(text: string) {
  vi.stubEnv('ANTHROPIC_API_KEY', 'key')
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('POST /api/reports/replay-practice', () => {
  it('requires sign-in', async () => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await POST(req({ sessionId: 's', attempt: 'hello' }))).status).toBe(401)
  })

  it('reads the criterion from the rep own report only and saves the result without the words', async () => {
    const d = db({ coach })
    vi.mocked(createClient).mockResolvedValue(d.client as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const fetch = modelReturns(JSON.stringify({ result: 'met', whatWorked: 'Good.', oneChange: null, quote: 'Which side effects' }))
    const res = await POST(req({ sessionId: 's1', attempt: 'I hear you. Which side effects worry you most?', successCriterion: 'ignored from client' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ result: 'met', quote: 'Which side effects', saved: true, practiceAttempt: true })
    expect(d.filters).toContainEqual(['rep_id', 'rep-1'])
    const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).messages[0].content as string
    expect(sent).toContain(coach.priority!.successCriterion)
    expect(sent).not.toContain('ignored from client')
    expect(d.inserts[0]).toMatchObject({ rep_id: 'rep-1', drill_id: 'replay:s1', attempt_no: 3, score: null, passed: true, observed_behaviors: ['met'] })
    expect(JSON.stringify(d.inserts[0])).not.toContain('Which side effects')
  })

  it('404s when the session has no report of the rep (or another rep owns it)', async () => {
    vi.mocked(createClient).mockResolvedValue(db(null).client as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    expect((await POST(req({ sessionId: 'someone-else', attempt: 'hello there' }))).status).toBe(404)
  })

  it('rejects empty attempts and returns 502 rather than inventing feedback', async () => {
    vi.mocked(createClient).mockResolvedValue(db({ coach }).client as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    expect((await POST(req({ sessionId: 's1', attempt: ' ' }))).status).toBe(400)
    modelReturns('no json')
    expect((await POST(req({ sessionId: 's1', attempt: 'Which side effects?' }))).status).toBe(502)
  })
})
