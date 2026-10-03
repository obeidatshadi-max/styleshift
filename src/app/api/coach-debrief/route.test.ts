import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/agents/llm', () => ({ createAnthropicComplete: vi.fn() }))
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { GET, POST, DELETE } from './route'
const input = { account: 'The doctor said price was high and I explained benefits.', objective: '', lang: 'en', answers: [], finish: false }
const report = { summary: 'Based on your account.', strength: 'Recall.', priority: 'Clarify.', hypothesis: 'May be price.', betterResponse: 'Compared with what?', nextAction: 'Ask.', practiceFocus: 'Price objection.' }
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
describe('private debrief API', () => {
  it('requires authentication for reading, generating and deleting', async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect((await POST(request(input))).status).toBe(401)
    expect((await DELETE(new Request('http://localhost/api/coach-debrief?id=x'))).status).toBe(401)
    expect(db.from).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })
  it('validates and rate limits before incurring model cost', async () => {
    expect((await POST(request({ ...input, account: '' }))).status).toBe(400)
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await POST(request(input))).status).toBe(429)
    expect(complete).not.toHaveBeenCalled()
  })
  it('does not save clarification as a completed debrief', async () => {
    complete.mockResolvedValue(JSON.stringify({ questions: ['What was agreed?'], report: null }))
    const res = await POST(request(input))
    expect(res.status).toBe(200)
    expect(db.from).not.toHaveBeenCalled()
  })
  it('binds saved ownership to authenticated user, ignoring forged rep_id', async () => {
    complete.mockResolvedValue(JSON.stringify({ questions: [], report }))
    const insert = vi.fn((_row: unknown) => ({ select: () => ({ single: async () => ({ data: { id: 'saved' }, error: null }) }) }))
    db.from.mockReturnValue({ insert })
    const res = await POST(request({ ...input, rep_id: 'other-user' }))
    expect(insert.mock.calls[0][0]).toMatchObject({ rep_id: 'owner' })
    expect(await res.json()).toMatchObject({ saved: true, id: 'saved' })
  })
  it('returns usable coaching with an explicit persistence failure', async () => {
    complete.mockResolvedValue(JSON.stringify({ questions: [], report }))
    db.from.mockReturnValue({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'missing table' } }) }) }) })
    const res = await POST(request(input))
    expect(await res.json()).toMatchObject({ saved: false, result: { report } })
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
