import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickNextVisit, loadRepData, personaForPractice, prepare, type RepData } from '@/lib/practice-my-doctor'
import { buildHcpContext } from '@/lib/hcp-context'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
const start = vi.fn()
vi.mock('@/lib/simulation-route', async () => {
  const actual = await vi.importActual<typeof import('@/lib/simulation-route')>('@/lib/simulation-route')
  return { ...actual, simulationContext: vi.fn(async () => ({ orchestrator: { start }, userId: 'rep-1' })) }
})

import * as previewRoute from './preview/route'
import * as startRoute from './start/route'
import { createClient } from '@/lib/supabase-server'

const NOW = Date.parse('2026-10-08T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const D1 = '11111111-1111-4111-8111-111111111111'
const D2 = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

const doctor = (id: string, over: Record<string, unknown> = {}) => ({
  id, rep_id: 'rep-1', name: `Dr ${id.slice(0, 2)}`, specialty: 'cardiology', workplace: null, style: 'analytical', assertiveness: 'ask', responsiveness: 'controls',
  key_phrases: null, objections: [], objection_notes: null, notes: 'Existing note', created_at: '', updated_at: '', hidden_concern: null,
  product_context: null, meeting_stage: null, available_time_min: 8, plan_objective: null, plan_success_measure: null, ...over,
}) as never
const visit = (id: string, doctorId: string, over: Record<string, unknown> = {}) => ({
  id, doctor_id: doctorId, source: 'manual', objection_raised: null, promise_made: null, what_worked: null, promise_done_at: null,
  is_contact: true, contact_at: null, created_at: daysAgo(5), note: null, ...over,
})
const data = (doctors: unknown[], visits: Record<string, unknown[]> = {}, debriefs: Record<string, unknown[]> = {}): RepData =>
  ({ doctors: doctors as never, visits: new Map(Object.entries(visits)) as never, debriefs: new Map(Object.entries(debriefs)) as never })
const profile = { id: 'rep-1', display_name: 'Rana', company_id: 'co', sps_top_key: null, sps_profile: null }

describe('pickNextVisit', () => {
  it('prefers the doctor with an open promise, and says why', () => {
    const d = data([doctor(D1), doctor(D2)], { [D2]: [visit('v', D2, { promise_made: 'Send the paper' })] })
    expect(pickNextVisit(d, NOW)).toEqual({ doctorId: D2, reason: 'promise' })
  })

  it('weighs a visit plan, a coach next action and time since contact', () => {
    expect(pickNextVisit(data([doctor(D1), doctor(D2, { plan_objective: 'Agree a trial' })]), NOW)).toEqual({ doctorId: D2, reason: 'plan' })
    expect(pickNextVisit(data([doctor(D1)], {}, { [D1]: [{ id: 'x', created_at: daysAgo(1), nextAction: 'Call' }] }), NOW)?.reason).toBe('next_action')
    expect(pickNextVisit(data([doctor(D1)], { [D1]: [visit('v', D1, { created_at: daysAgo(40) })] }), NOW)?.reason).toBe('stale')
  })

  it('falls back to the most recently updated doctor when nothing stands out, and to null with no doctors', () => {
    expect(pickNextVisit(data([doctor(D1), doctor(D2)]), NOW)).toEqual({ doctorId: D1, reason: 'recent' })
    expect(pickNextVisit(data([]), NOW)).toBeNull()
  })
})

describe('prepare', () => {
  it('only resolves doctors that belong to the rep', () => {
    expect(prepare(data([doctor(D1)]), { doctorId: OTHER, seed: 's', nowMs: NOW })).toBeNull()
    expect(prepare(data([doctor(D1)]), { doctorId: D1, seed: 's', nowMs: NOW })).toMatchObject({ reason: 'chosen' })
  })
})

describe('personaForPractice', () => {
  const ctx = (v: unknown[] = [], seed = 's') => buildHcpContext(doctor(D1), v as never, [], seed, NOW)

  it('keeps the saved doctor and adds the labelled context to the background', () => {
    const c = ctx([visit('v1', D1, { objection_raised: 'Not enough data' })])
    const { persona } = personaForPractice(doctor(D1), profile, c, 'realistic', [])
    expect(persona.physician.doctorId).toBe(D1)
    expect(persona.physician.notes).toContain('Existing note')
    expect(persona.physician.notes).toMatch(/Recorded by the rep.*Not enough data/)
    expect(persona.physician.notes).toMatch(/Possible tendencies/)
  })

  it('leaves out facts the rep excluded, along with what was inferred from them', () => {
    const c = ctx([visit('v1', D1, { objection_raised: 'Not enough data' })])
    const { persona, used } = personaForPractice(doctor(D1), profile, c, 'realistic', ['v:v1:objection'])
    expect(persona.physician.notes).not.toContain('Not enough data')
    expect(used.inferences.some(i => i.kind === 'objection_again')).toBe(false)
  })

  it('really shortens the visit for a short-time challenge, and only then', () => {
    const seedFor = (id: string) => { for (let i = 0; i < 500; i++) { if (ctx([], `s${i}`).challenge === id) return `s${i}` } throw new Error('seed') }
    const short = personaForPractice(doctor(D1), profile, ctx([], seedFor('short_time')), 'realistic', [])
    expect(short.persona.physician.availableTimeMin).toBe(3)
    const other = personaForPractice(doctor(D1), profile, ctx([], seedFor('interrupted')), 'realistic', [])
    expect(other.persona.physician.availableTimeMin).toBe(8)
  })
})

describe('loadRepData', () => {
  it('groups visits and debriefs by doctor and drops debriefs with no doctor or next action', async () => {
    const tables: Record<string, unknown> = {
      doctors: [doctor(D1)],
      doctor_visits: [visit('a', D1), visit('b', D1), visit('c', D2)],
      coach_debriefs: [{ id: 'x', created_at: 't', doctorId: D1, visitDate: null, nextAction: 'Call' }, { id: 'y', created_at: 't', doctorId: null, nextAction: 'Lost' }, { id: 'z', created_at: 't', doctorId: D1, nextAction: null }],
    }
    const supabase = { from: (t: string) => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c; c.then = (r: (v: unknown) => void) => r({ data: tables[t] }); return c } }
    const repData = await loadRepData(supabase as never, 'rep-1')
    expect(repData.visits.get(D1)).toHaveLength(2)
    expect(repData.debriefs.get(D1)).toHaveLength(1)
    expect(repData.debriefs.size).toBe(1)
  })
})

// Handlers return early with a guard response, so TypeScript types them loosely; every call resolves to a Response.
const call = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => Promise.resolve(fn(...a)) as Promise<Response>
const preview = call(previewRoute.GET), startPost = call(startRoute.POST)

function client(opts: { doctors?: unknown[]; visits?: unknown[]; user?: string | null } = {}) {
  const tables: Record<string, unknown> = { doctors: opts.doctors ?? [doctor(D1)], doctor_visits: opts.visits ?? [], coach_debriefs: [] }
  return {
    auth: { getUser: async () => ({ data: { user: opts.user === null ? null : { id: opts.user ?? 'rep-1' } } }) },
    from: (t: string) => {
      if (t === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }
      const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c; c.then = (r: (v: unknown) => void) => r({ data: tables[t] }); return c
    },
  }
}
const req = (url = 'http://localhost/x') => new Request(url)
const post = (body: unknown) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => { vi.stubEnv('PRACTICE_MY_DOCTOR_ENABLED', 'true'); start.mockResolvedValue({ ok: true, sessionId: 'new', doctorText: 'Hello.' }) })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('GET /api/practice-my-doctor/preview', () => {
  it('is hidden when off and needs login', async () => {
    vi.stubEnv('PRACTICE_MY_DOCTOR_ENABLED', 'false')
    expect((await preview(req())).status).toBe(404)
    vi.stubEnv('PRACTICE_MY_DOCTOR_ENABLED', 'true')
    vi.mocked(createClient).mockResolvedValue(client({ user: null }) as never)
    expect((await preview(req())).status).toBe(401)
  })

  it('suggests the next visit, with the three kinds of content kept separate', async () => {
    vi.mocked(createClient).mockResolvedValue(client({ visits: [visit('v1', D1, { objection_raised: 'Not enough data' })] }) as never)
    const body = await (await preview(req())).json()
    expect(body.doctor.id).toBe(D1)
    expect(body.context.facts.length).toBeGreaterThan(0)
    expect(body.context.inferences.every((i: { certainty: string }) => i.certainty === 'inferred')).toBe(true)
    expect(CHALLENGES).toContain(body.context.challenge)
  })

  it('does not resolve a doctor id that is not in the rep\'s own list', async () => {
    vi.mocked(createClient).mockResolvedValue(client() as never)
    const body = await (await preview(req(`http://localhost/x?doctorId=${OTHER}`))).json()
    expect(body.prepared).toBeNull()
    expect(body.doctor).toBeUndefined()
  })
})

const CHALLENGES = ['short_time', 'new_competitor', 'vague_objection', 'interrupted']

describe('POST /api/practice-my-doctor/start', () => {
  it('is hidden when off', async () => {
    vi.stubEnv('PRACTICE_MY_DOCTOR_ENABLED', 'false')
    expect((await startPost(post({}))).status).toBe(404)
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects a malformed doctor id, difficulty or body', async () => {
    vi.mocked(createClient).mockResolvedValue(client() as never)
    expect((await startPost(post({ doctorId: 'nope' }))).status).toBe(400)
    expect((await startPost(post({ difficulty: 'easy' }))).status).toBe(400)
    expect((await startPost(new Request('http://localhost/x', { method: 'POST', body: 'x' }))).status).toBe(400)
  })

  it('refuses a doctor that is not the rep\'s own', async () => {
    vi.mocked(createClient).mockResolvedValue(client() as never)
    expect((await startPost(post({ doctorId: OTHER }))).status).toBe(404)
    expect(start).not.toHaveBeenCalled()
  })

  it('builds the persona from the rep\'s records, applies exclusions, and records what the session was given', async () => {
    vi.mocked(createClient).mockResolvedValue(client({ visits: [visit('v1', D1, { objection_raised: 'Not enough data', what_worked: 'Short summary' })] }) as never)
    const res = await startPost(post({ doctorId: D1, seed: 'fixed', exclude: ['v:v1:objection'], lang: 'en' }))
    expect(res.status).toBe(200)
    const input = start.mock.calls[0][0]
    expect(input.persona.physician.doctorId).toBe(D1)
    expect(input.persona.physician.notes).toContain('Short summary')
    expect(input.persona.physician.notes).not.toContain('Not enough data')
    expect(input.practiceContext.factIds).not.toContain('v:v1:objection')
    expect(input.practiceContext.factIds).toContain('v:v1:worked')
    expect(CHALLENGES).toContain(input.practiceContext.challenge)
  })

  it('uses the preview\'s seed so the challenge shown is the challenge run', async () => {
    vi.mocked(createClient).mockResolvedValue(client() as never)
    const shown = (await (await preview(req('http://localhost/x?seed=abc'))).json()).context.challenge
    await startPost(post({ doctorId: D1, seed: 'abc' }))
    expect(start.mock.calls[0][0].practiceContext.challenge).toBe(shown)
  })

  it('maps an orchestrator failure to its status', async () => {
    vi.mocked(createClient).mockResolvedValue(client() as never)
    start.mockResolvedValue({ ok: false, error: 'doctor_unavailable' })
    expect((await startPost(post({ doctorId: D1 }))).status).toBe(502)
  })
})
