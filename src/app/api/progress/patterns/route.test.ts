import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import type { SessionScore } from '@/schemas/scoring'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))

import * as route from './route'
import { createClient } from '@/lib/supabase-server'

const GET = () => Promise.resolve(route.GET()) as Promise<Response>

function pitchSession(id: string) {
  const s = createEmptySession(id, 'rep-1')
  s.endedAt = '2026-10-01T10:00:00Z'
  s.transcript = [{ turnIndex: 1, role: 'rep', text: 'Our product is the best.', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }]
  const empty = { score: null, reason: 'insufficient_evidence' as const, observationsUsed: 0, contributions: [] }
  s.scores = { competencies: { questioning: empty, active_listening: empty, adaptation: empty, objection_handling: empty, value_communication: empty, closing: empty,
    discovery: { score: 40, reason: 'scored', observationsUsed: 1, contributions: [{ behavior: 'premature_pitch', direction: 'negative', confidence: 0.9, points: -5, evidenceTurns: [1] }] } },
    overall: 40, coverage: 0.2, configVersion: 'x', scoredAt: 'x' } as SessionScore
  return { record: { session: s, phase: 'scored', trace: [], report: null } }
}
function client(rows: unknown[], user: string | null = 'rep-1') {
  const calls: string[] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = (...a: unknown[]) => { calls.push(`${m}:${a.join(',')}`); return chain }
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows })
  return { calls, c: { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) }, from: () => chain } }
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('GET /api/progress/patterns', () => {
  it('looks like a missing route when the flag is off', async () => {
    vi.mocked(createClient).mockResolvedValue(client([]).c as never)
    expect((await GET()).status).toBe(404)
  })

  it('requires login', async () => {
    vi.stubEnv('PATTERN_MEMORY_ENABLED', 'true')
    vi.mocked(createClient).mockResolvedValue(client([], null).c as never)
    expect((await GET()).status).toBe(401)
  })

  it('computes insights from the rep\'s own recent simulations, up to the window, and stores nothing', async () => {
    vi.stubEnv('PATTERN_MEMORY_ENABLED', 'true')
    const { c, calls } = client(['s1', 's2', 's3', 's4'].map(pitchSession))
    vi.mocked(createClient).mockResolvedValue(c as never)
    const body = await (await GET()).json()
    expect(body.sessionsConsidered).toBe(4)
    expect(body.insights[0]).toMatchObject({ kind: 'recurring_hurt', interpretation: { certainty: 'inferred' }, recommendation: { changesScoringConfig: false } })
    expect(calls).toContain('eq:rep_id,rep-1')
    expect(calls).toContain('limit:20')
    expect(calls.some(x => /^(insert|update|upsert)/.test(x))).toBe(false)
  })
})
