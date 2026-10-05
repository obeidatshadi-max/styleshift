import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/agents/llm', () => ({ createAnthropicComplete: vi.fn() }))
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { GET, POST, DELETE } from './route'

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
    expect((await GET()).status).toBe(401)
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
    expect((await GET()).status).toBe(200)
    expect(eq).toHaveBeenCalledWith('rep_id', 'owner')
    const ownerEq = vi.fn(async () => ({ error: null }))
    eq.mockReturnValue({ eq: ownerEq })
    expect((await DELETE(new Request('http://localhost/api/coach-debrief?id=00000000-0000-4000-8000-000000000001'))).status).toBe(200)
    expect(ownerEq).toHaveBeenCalledWith('rep_id', 'owner')
  })
})
