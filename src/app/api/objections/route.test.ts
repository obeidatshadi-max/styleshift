import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), clientIp: () => '203.0.113.7' }))
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { GET, POST } from './route'

type Row = Record<string, unknown>
let rows: Row[]

/** Just the query-builder calls the route makes, over an in-memory table. */
function fakeDb() {
  return {
    from() {
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      let idFilter: unknown
      let limit = Infinity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        order: () => q,
        limit: (n: number) => { limit = n; return q },
        insert: (p: Row) => { op = 'insert'; payload = p; return q },
        update: (p: Row) => { op = 'update'; payload = p; return q },
        eq: (_c: string, v: unknown) => { idFilter = v; return q },
        single: () => Promise.resolve(q.run()).then((r: { data: Row[] }) => ({ data: r.data[0], error: null })),
        run() {
          if (op === 'insert') {
            const row = { id: randomUUID(), realism: 0, created_at: new Date().toISOString(), ...payload }
            rows.unshift(row)
            return { data: [row], error: null }
          }
          if (op === 'update') {
            const hit = rows.filter(r => r.id === idFilter)
            hit.forEach(r => Object.assign(r, payload))
            return { data: hit, error: null }
          }
          return { data: rows.slice(0, limit), error: null }
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(q.run()).then(res, rej),
      }
      return q
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = async (body: unknown): Promise<{ status: number; json: any }> => {
  const res = await POST(new Request('http://x/api/objections', { method: 'POST', body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json() }
}
const add = (extra: Row = {}) =>
  post({ action: 'add', code: 'baghdad26', style: 'driver', text_ar: 'هذا الدواء غالي', ...extra })

beforeEach(() => {
  rows = []
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createAdminClient).mockReturnValue(fakeDb() as any)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
  vi.stubEnv('OBJECTION_BANK_CODE', 'BAGHDAD26')
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/objections', () => {
  it('lets anyone read the board, newest first', async () => {
    await add({ text_ar: 'أول' })
    await add({ text_ar: 'ثاني' })
    const res = await GET()
    const body = await res.json()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(body.writable).toBe(true)
    expect(body.objections.map((o: Row) => o.text_ar)).toEqual(['ثاني', 'أول'])
  })

  it('adds an objection with the code, case-insensitive, trimming fields', async () => {
    const { status, json } = await add({ context: '  cardiology ', codeSwitch: true, code: ' baghdad26 ' })
    expect(status).toBe(200)
    expect(json.objection).toMatchObject({ style: 'driver', context: 'cardiology', code_switch: true, realism: 0 })
  })

  it('refuses a wrong or missing code and writes nothing', async () => {
    expect((await add({ code: 'nope' })).status).toBe(401)
    expect((await add({ code: undefined })).status).toBe(401)
    expect((await post({ action: 'check', code: 'nope' })).status).toBe(401)
    expect((await post({ action: 'check', code: 'BAGHDAD26' })).status).toBe(200)
    expect(rows).toHaveLength(0)
  })

  it('is read-only when no workshop code is configured', async () => {
    vi.stubEnv('OBJECTION_BANK_CODE', '')
    expect((await add()).status).toBe(403)
    expect((await (await GET()).json()).writable).toBe(false)
  })

  it('validates style, text and lengths', async () => {
    expect((await add({ style: 'boss' })).status).toBe(400)
    expect((await add({ text_ar: '   ' })).status).toBe(400)
    expect((await add({ text_ar: 'x'.repeat(501) })).status).toBe(400)
    expect((await add({ context: 'x'.repeat(121) })).status).toBe(400)
    expect((await post('not an object')).status).toBe(400)
    expect((await post({ action: 'drop', code: 'BAGHDAD26' })).status).toBe(400)
  })

  it('rates 1 to 5 stars on an existing objection only', async () => {
    const id = (await add()).json.objection.id
    expect((await post({ action: 'rate', code: 'BAGHDAD26', id, realism: 4 })).status).toBe(200)
    expect(rows[0].realism).toBe(4)
    expect((await post({ action: 'rate', code: 'BAGHDAD26', id, realism: 6 })).status).toBe(400)
    expect((await post({ action: 'rate', code: 'BAGHDAD26', id, realism: 2.5 })).status).toBe(400)
    expect((await post({ action: 'rate', code: 'BAGHDAD26', id: 'x', realism: 3 })).status).toBe(400)
    expect((await post({ action: 'rate', code: 'BAGHDAD26', id: randomUUID(), realism: 3 })).status).toBe(404)
    expect((await post({ action: 'rate', code: 'wrong', id, realism: 1 })).status).toBe(401)
    expect(rows[0].realism).toBe(4)
  })

  it('rate limits writes and code guesses', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await add()).status).toBe(429)
    expect((await post({ action: 'check', code: 'guess' })).status).toBe(429)
    expect(rows).toHaveLength(0)
  })
})
