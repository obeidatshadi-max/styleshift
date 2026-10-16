import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { POST as interpret } from './interpret/route'
import { GET, POST, PATCH } from './knowledge/route'

const m = vi.hoisted(() => ({ client: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: m.client }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: m.limit }))
const entry = { id: 'e', expression: 'ما عندي وكت', literal_meaning: 'No time', contextual_meaning: 'ضيق الوقت',
  region: 'baghdad', kind: 'workflow', specialty: 'general', uncertainty: 'Clarify', source_reference: 'Synthetic review', status: 'approved', version: 2 }
let reviewer: boolean, user: boolean, failure: boolean, rows: typeof entry[]
let tables: string[], writes: unknown[], filters: unknown[]
beforeEach(() => {
  vi.stubEnv('IHIA_ENABLED', 'true'); m.limit.mockResolvedValue(true)
  reviewer = true; user = true; failure = false; rows = [entry]; tables = []; writes = []; filters = []
  m.client.mockImplementation(async () => ({
    auth: { getUser: async () => ({ data: { user: user ? { id: 'u' } : null } }) },
    from: (table: string) => {
      tables.push(table)
      const result = () => ({ data: table === 'ihia_reviewers' ? reviewer ? { user_id: 'u' } : null : rows, error: failure ? {} : null })
      const q: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'limit', 'eq', 'insert', 'update']) q[op] = (...args: unknown[]) => {
        if (op === 'insert' || op === 'update') writes.push(args[0])
        if (op === 'eq') filters.push(args)
        return q
      }
      q.single = async () => ({ ...result(), data: rows[0] })
      q.maybeSingle = async () => ({ ...result(), data: table === 'ihia_reviewers' ? reviewer ? { user_id: 'u' } : null : rows[0] ?? null })
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return q
    },
  }))
})
afterEach(() => vi.unstubAllEnvs())
const req = (body: unknown) => new Request('http://localhost/api/ihia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
describe('IHIA vertical slice and reviewer authorization', () => {
  it('approved expression → DB retrieval → contextual response', async () => {
    const res = await interpret(req({ text: 'دكتور ما عندي وكت' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ original: 'دكتور ما عندي وكت', response: expect.stringContaining('ضيق الوقت') })
    expect(filters).toContainEqual(['status', 'approved'])
    expect(writes).toEqual([])
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('also excludes unapproved material at the interpretation boundary', async () => {
    rows = [{ ...entry, status: 'rejected' }]
    expect((await (await interpret(req({ text: entry.expression }))).json()).matches).toEqual([])
  })
  it('requires authentication and feature enablement', async () => {
    user = false
    expect((await interpret(req({ text: 'x' }))).status).toBe(401)
    expect((await POST(req(entry))).status).toBe(401)
    vi.stubEnv('IHIA_ENABLED', 'false')
    expect((await interpret(req({ text: 'x' }))).status).toBe(404)
  })
  it('denies every reviewer operation to ordinary authenticated users', async () => {
    reviewer = false
    expect((await GET(new Request('http://localhost/api/ihia/knowledge'))).status).toBe(403)
    expect((await POST(req(entry))).status).toBe(403)
    expect((await PATCH(req({ id: 'e', action: 'approved', version: 2, review_note: 'Reviewed' }))).status).toBe(403)
    expect(tables).not.toContain('ihia_entries')
    expect(writes).toEqual([])
  })
  it('creates drafts without trusting client approval or creator fields', async () => {
    expect((await POST(req({ ...entry, created_by: 'attacker' }))).status).toBe(201)
    expect(writes[0]).toMatchObject({ created_by: 'u' })
    expect(writes[0]).not.toHaveProperty('status')
  })
  it('corrections require reapproval and use optimistic concurrency', async () => {
    expect((await PATCH(req({ id: 'e', version: 2, action: 'correct', entry, review_note: 'Expert correction' }))).status).toBe(200)
    expect(writes[0]).toMatchObject({ status: 'draft' })
    expect(filters).toContainEqual(['version', 2])
    rows = []
    expect((await PATCH(req({ id: 'e', version: 2, action: 'approved', review_note: 'Reviewed' }))).status).toBe(409)
  })
  it('rejects missing provenance and review reasons', async () => {
    expect((await POST(req({ ...entry, source_reference: '' }))).status).toBe(400)
    expect((await PATCH(req({ id: 'e', version: 2, action: 'approved', review_note: '' }))).status).toBe(400)
    expect(writes).toEqual([])
  })
  it('fails closed on unavailable knowledge and rate limits', async () => {
    failure = true
    expect((await interpret(req({ text: 'x' }))).status).toBe(503)
    m.limit.mockResolvedValue(false)
    expect((await interpret(req({ text: 'x' }))).status).toBe(429)
  })
  it.each([null, {}, { text: 'x'.repeat(2001) }, { text: 'x', region: 'unknown' }])('validates input', async body => {
    expect((await interpret(req(body))).status).toBe(400)
  })
})
