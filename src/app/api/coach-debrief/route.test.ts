import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/agents/llm', () => ({ createAnthropicComplete: vi.fn() }))
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { GET, POST, PUT, DELETE } from './route'

const doctorId = '00000000-0000-4000-8000-000000000001'
const input = {
  doctorId, account: 'The doctor said price was high and I explained benefits.', objective: 'Agree a next visit',
  successMeasure: 'A date is agreed', lang: 'en',
  reflections: { wentWell: 'I listened first.', changeNextTime: 'Ask one question.', objectiveReview: 'No date was agreed.' },
}
const report = { summary: 'Based on your account.', strength: 'You listened.', priority: 'Clarify.', hypothesis: 'May be price.', betterResponse: 'Compared with what?', objectiveReview: 'No date was agreed, so the goal was not met.', nextAction: 'Ask.', practiceFocus: 'Price objection.' }
const request = (body: unknown) => new Request('http://localhost/api/coach-debrief', { method: 'POST', body: JSON.stringify(body) })
const complete = vi.fn()
let db: any

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  db = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner' } } })) }, from: vi.fn() }
  vi.mocked(createClient).mockResolvedValue(db)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
  vi.mocked(createAnthropicComplete).mockReturnValue(complete)
})

describe('private, doctor-linked debrief API', () => {
  it('requires authentication for reading, generating and deleting', async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request('http://localhost/api/coach-debrief'))).status).toBe(401)
    expect((await POST(request(input))).status).toBe(401)
    expect((await DELETE(new Request('http://localhost/api/coach-debrief?id=x'))).status).toBe(401)
    expect(db.from).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })
  it('validates and checks profile ownership before spending model tokens', async () => {
    expect((await POST(request({ ...input, account: 'short' }))).status).toBe(400)
    db.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) })
    expect((await POST(request(input))).status).toBe(404)
    expect(complete).not.toHaveBeenCalled()
  })
  it('rate limits before calling AI and saves against the verified doctor', async () => {
    complete.mockResolvedValue(JSON.stringify({ questions: [], report }))
    const insert = vi.fn((row: unknown) => ({ select: () => ({ single: async () => ({ data: { id: 'saved' }, error: null }) }) }))
    const doctorQuery = { eq: vi.fn(), maybeSingle: async () => ({ data: { id: doctorId, name: 'Dr. Example' } }) }
    doctorQuery.eq.mockReturnValue(doctorQuery)
    db.from.mockImplementation((table: string) => table === 'doctors' ? { select: () => doctorQuery } : { insert })
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await POST(request(input))).status).toBe(429)
    expect(complete).not.toHaveBeenCalled()
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ ...input, doctor_name: 'forged' }))
    expect(res.status).toBe(200)
    expect(insert.mock.calls[0][0]).toMatchObject({ rep_id: 'owner', doctor_id: doctorId, doctor_name: 'Dr. Example' })
    expect(await res.json()).toMatchObject({ saved: true, id: 'saved', result: { report } })
  })
  it('filters history and deletion by the signed-in owner', async () => {
    const eq = vi.fn()
    db.from.mockReturnValue({ select: () => ({ eq }), delete: () => ({ eq }) })
    eq.mockReturnValue({ order: () => ({ limit: async () => ({ data: [], error: null }) }) })
    expect((await GET(new Request('http://localhost/api/coach-debrief'))).status).toBe(200)
    expect(eq).toHaveBeenCalledWith('rep_id', 'owner')
    const ownerEq = vi.fn(async () => ({ error: null }))
    eq.mockReturnValue({ eq: ownerEq })
    expect((await DELETE(new Request('http://localhost/api/coach-debrief?id=00000000-0000-4000-8000-000000000001'))).status).toBe(200)
    expect(ownerEq).toHaveBeenCalledWith('rep_id', 'owner')
  })
})


describe('save recovery and idempotency', () => {
  const requestId = '11111111-1111-4111-8111-111111111111'
  let stored: any, failInsert: boolean, insert: ReturnType<typeof vi.fn>, eq: ReturnType<typeof vi.fn>
  beforeEach(() => {
    stored = null; failInsert = false
    complete.mockResolvedValue(JSON.stringify({ questions: [], report }))
    insert = vi.fn((row: any) => ({ select: () => ({ single: async () => {
      if (failInsert) return { data: null, error: { code: '08006' } }
      if (stored) return { data: null, error: { code: '23505' } }
      stored = row; return { data: { id: row.id }, error: null }
    } }) }))
    const query: any = { maybeSingle: async () => ({ data: stored, error: null }), order: () => query, limit: async () => ({ data: stored ? [stored] : [], error: null }) }
    eq = vi.fn(() => query); query.eq = eq
    const doctorQuery: any = { eq: () => doctorQuery, maybeSingle: async () => ({ data: { id: doctorId, name: 'Dr. Example' } }) }
    db.from.mockImplementation((table: string) => table === 'doctors' ? { select: () => doctorQuery } : { select: () => query, insert })
  })
  it('retries a signed report save without generating again, including a lost save response', async () => {
    failInsert = true
    const generated = await (await POST(request({ ...input, requestId }))).json()
    expect(generated.saved).toBe(false); expect(generated.recoveryToken).toBeTruthy()
    failInsert = false
    const retry = () => PUT(new Request('http://localhost/api/coach-debrief', { method: 'PUT', body: JSON.stringify({ recoveryToken: generated.recoveryToken }) }))
    expect(await (await retry()).json()).toMatchObject({ saved: true, id: requestId })
    expect(await (await retry()).json()).toMatchObject({ saved: true, id: requestId })
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it('returns the original saved result on generation retry and rejects reused IDs with different input', async () => {
    await POST(request({ ...input, requestId }))
    expect(await (await POST(request({ ...input, requestId }))).json()).toMatchObject({ saved: true, id: requestId })
    expect(complete).toHaveBeenCalledTimes(1)
    expect((await POST(request({ ...input, requestId, account: 'A different account of the same customer visit.' }))).status).toBe(409)
  })
  it('rejects a tampered recovery token and a different account', async () => {
    failInsert = true
    const generated = await (await POST(request({ ...input, requestId }))).json()
    const retry = (token: string) => PUT(new Request('http://localhost/api/coach-debrief', { method: 'PUT', body: JSON.stringify({ recoveryToken: token }) }))
    expect((await retry(generated.recoveryToken + 'x')).status).toBe(400)
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'other' } } })
    expect((await retry(generated.recoveryToken)).status).toBe(400)
    expect(insert).toHaveBeenCalledTimes(1)
  })
  it('filters latest history by both doctor and authenticated owner', async () => {
    expect((await GET(new Request(`http://localhost/api/coach-debrief?doctorId=${doctorId}`))).status).toBe(200)
    expect(eq).toHaveBeenCalledWith('doctor_id', doctorId); expect(eq).toHaveBeenCalledWith('rep_id', 'owner')
  })
})
