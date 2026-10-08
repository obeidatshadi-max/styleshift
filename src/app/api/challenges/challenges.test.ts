import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import type { SessionScore } from '@/schemas/scoring'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
const start = vi.fn()
vi.mock('@/lib/simulation-route', async () => {
  const actual = await vi.importActual<typeof import('@/lib/simulation-route')>('@/lib/simulation-route')
  return { ...actual, simulationContext: vi.fn(async () => ({ orchestrator: { start }, userId: 'rep-1' })) }
})

import * as nextRoute from './next/route'
import * as startRoute from './start/route'
import { createClient } from '@/lib/supabase-server'
import { simulationContext } from '@/lib/simulation-route'
import { loadChallengeData, nextChallenge } from '@/lib/challenge-load'

/** A finished session in which the rep pitched too early (turn 1) against an analytical doctor. */
function pitchSession(id: string, challenge?: string) {
  const s = createEmptySession(id, 'rep-1')
  s.endedAt = '2026-10-01T10:00:00Z'
  s.socialStyle.dominant = 'analytical'
  s.objections.activeType = 'doubt'
  if (challenge) s.challenge = { behavior: challenge }
  s.transcript = [{ turnIndex: 1, role: 'rep', text: 'Our product is the best.', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }]
  const empty = { score: null, reason: 'insufficient_evidence' as const, observationsUsed: 0, contributions: [] }
  s.scores = { competencies: { questioning: empty, active_listening: empty, adaptation: empty, objection_handling: empty, value_communication: empty, closing: empty,
    discovery: { score: 40, reason: 'scored', observationsUsed: 1, contributions: [{ behavior: 'premature_pitch', direction: 'negative', confidence: 0.9, points: -5, evidenceTurns: [1] }] } },
    overall: 40, coverage: 0.2, configVersion: 'x', scoredAt: 'x' } as SessionScore
  return { record: { session: s, phase: 'scored', trace: [], report: null } }
}

function client(rows: unknown[], profile: unknown = { id: 'rep-1', display_name: 'R', company_id: 'co', sps_top_key: null, sps_profile: null }, user: string | null = 'rep-1') {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows })
  return {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from: (table: string) => (table === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) } : chain),
  }
}
// Handlers return early with a guard response, so TypeScript types them loosely; every call resolves to a Response.
const call = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => Promise.resolve(fn(...a)) as Promise<Response>
const GET = call(nextRoute.GET), POST = call(startRoute.POST)
const history = (n: number, challenge?: string) => Array.from({ length: n }, (_, i) => pitchSession(`s${i + 1}`, challenge && i < 2 ? challenge : undefined))
const post = (body: unknown = {}) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => { vi.stubEnv('ADAPTIVE_CHALLENGES_ENABLED', 'true'); start.mockResolvedValue({ ok: true, sessionId: 'new', doctorText: 'Hello.' }) })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('loadChallengeData / nextChallenge', () => {
  it('keeps every considered session (even without events) and tags sessions started from a challenge', async () => {
    const data = await loadChallengeData(client(history(4, 'premature_pitch')) as never, 'rep-1')
    expect(data.sessionIds).toEqual(['s1', 's2', 's3', 's4'])
    expect([...data.targeted]).toEqual([['s1', 'premature_pitch'], ['s2', 'premature_pitch']])
  })

  it('recommends from stored history and attaches progress once the rep has practised it', async () => {
    const data = await loadChallengeData(client(history(5, 'premature_pitch')) as never, 'rep-1')
    const out = nextChallenge(data, 'en')
    expect(out.recommendation.status).toBe('recommended')
    expect(out.progress).toMatchObject({ behavior: 'premature_pitch', targetedSessions: 2 })
  })
})

describe('GET /api/challenges/next', () => {
  it('looks like a missing route when the flag is off', async () => {
    vi.stubEnv('ADAPTIVE_CHALLENGES_ENABLED', 'false')
    expect((await GET(new Request('http://localhost/x'))).status).toBe(404)
  })

  it('requires login, and returns a recommendation without raw event ids', async () => {
    vi.mocked(createClient).mockResolvedValue(client([], null, null) as never)
    expect((await GET(new Request('http://localhost/x'))).status).toBe(401)
    vi.mocked(createClient).mockResolvedValue(client(history(4)) as never)
    const body = await (await GET(new Request('http://localhost/x?lang=en'))).json()
    expect(body.recommendation).toMatchObject({ status: 'recommended', changesScoringConfig: false })
    expect(body.recommendation.weakness.pattern.behavior).toBe('premature_pitch')
    expect(body.recommendation.weakness.pattern.eventIds).toBeUndefined()
  })

  it('returns "no_pattern" for a rep with too little history', async () => {
    vi.mocked(createClient).mockResolvedValue(client(history(2)) as never)
    expect((await (await GET(new Request('http://localhost/x'))).json()).recommendation.status).toBe('no_pattern')
  })
})

describe('POST /api/challenges/start', () => {
  it('is hidden when the flag is off and never starts a simulation', async () => {
    vi.stubEnv('ADAPTIVE_CHALLENGES_ENABLED', 'false')
    expect((await POST(post())).status).toBe(404)
    expect(start).not.toHaveBeenCalled()
  })

  it('refuses with 409 when there is no recurring pattern to target', async () => {
    vi.mocked(createClient).mockResolvedValue(client(history(2)) as never)
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'no_pattern' })
    expect(start).not.toHaveBeenCalled()
  })

  it('recomputes the target from stored history, ignoring anything the request claims', async () => {
    vi.mocked(createClient).mockResolvedValue(client(history(4)) as never)
    const res = await POST(post({ behavior: 'hedged_delivery', difficulty: 'pressure_test', style: 'driver', lang: 'en' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessionId: 'new', doctorText: 'Hello.' })
    const input = start.mock.calls[0][0]
    expect(input.challenge).toEqual({ behavior: 'premature_pitch' })
    expect(input.difficulty).not.toBe('pressure_test')
    expect(input.persona.socialStyle.dominant).toBe('analytical') // from the rep's history, not the body
    expect(input.persona.physician.doctorId).toBeNull()
    expect(input.learningObjectives[0].label).toMatch(/situation/)
  })

  it('passes through the simulation guard (flag, auth, rate limit) before doing anything', async () => {
    vi.mocked(simulationContext).mockResolvedValueOnce({ response: new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }) } as never)
    expect((await POST(post())).status).toBe(429)
    expect(start).not.toHaveBeenCalled()
  })

  it('maps an orchestrator failure to its status', async () => {
    vi.mocked(createClient).mockResolvedValue(client(history(4)) as never)
    start.mockResolvedValue({ ok: false, error: 'doctor_unavailable' })
    expect((await POST(post())).status).toBe(502)
  })
})
