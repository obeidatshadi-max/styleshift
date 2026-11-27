import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      const filters: [string, unknown][] = []
      let limit = Infinity
      let cols: string[] | null = null
      const pick = (list: Row[]) => (cols ? list.map(r => Object.fromEntries(cols!.map(c => [c, r[c]]))) : list)
      const match = () => rows.filter(r => filters.every(([c, v]) => r[c] === v))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: (c?: string) => { if (c) cols = c.split(',').map(x => x.trim()); return q },
        order: () => q,
        limit: (n: number) => { limit = n; return q },
        insert: (p: Row) => { op = 'insert'; payload = p; return q },
        update: (p: Row) => { op = 'update'; payload = p; return q },
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
        single: () => Promise.resolve(q.run()).then((r: { data: Row[] }) => ({ data: r.data[0], error: null })),
        run() {
          if (op === 'insert') {
            const row = { id: randomUUID(), realism: 0, created_at: new Date().toISOString(), ...payload }
            rows.unshift(row)
            return { data: pick([row]), error: null }
          }
          if (op === 'update') {
            const hit = match()
            hit.forEach(r => Object.assign(r, payload))
            return { data: pick(hit), error: null }
          }
          return { data: pick(match().slice(0, limit)), error: null }
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(q.run()).then(res, rej),
      }
      return q
    },
  }
}

const ALICE = randomUUID()
const BOB = randomUUID()
const headers = (key?: string): Record<string, string> => (key ? { 'x-board-key': key } : {})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = async (body: unknown, key: string | undefined = ALICE): Promise<{ status: number; json: any }> => {
  const res = await POST(new Request('http://x/api/objections', { method: 'POST', headers: headers(key), body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json() }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const list = async (key?: string): Promise<{ status: number; json: any; res: Response }> => {
  const res = await GET(new Request('http://x/api/objections', { headers: headers(key) }))
  return { status: res.status, json: await res.json(), res }
}
const add = (extra: Row = {}, key: string = ALICE) =>
  post({ action: 'add', style: 'driver', text_ar: 'هذا الدواء غالي', ...extra }, key)

beforeEach(() => {
  rows = []
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createAdminClient).mockReturnValue(fakeDb() as any)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
})

describe('/api/objections', () => {
  it('shows each browser only its own entries, newest first', async () => {
    await add({ text_ar: 'أول' })
    await add({ text_ar: 'ثاني' })
    await add({ text_ar: 'مال بوب' }, BOB)
    const alice = await list(ALICE)
    expect(alice.res.headers.get('Cache-Control')).toBe('no-store')
    expect(alice.json.objections.map((o: Row) => o.text_ar)).toEqual(['ثاني', 'أول'])
    expect((await list(BOB)).json.objections.map((o: Row) => o.text_ar)).toEqual(['مال بوب'])
    expect((await list(randomUUID())).json.objections).toEqual([])
  })

  it('stores a hash of the key, never the key, and never returns it', async () => {
    const { json } = await add()
    expect(rows[0].owner_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rows)).not.toContain(ALICE)
    expect(json.objection).not.toHaveProperty('owner_hash')
  })

  it('refuses requests with a missing or malformed key', async () => {
    expect((await list()).status).toBe(400)
    expect((await list('short')).status).toBe(400)
    expect((await add({}, '')).status).toBe(400)
    expect((await add({}, 'x'.repeat(31))).status).toBe(400)
    expect(rows).toHaveLength(0)
  })

  it('adds an objection, trimming fields', async () => {
    const { status, json } = await add({ context: '  cardiology ', codeSwitch: true })
    expect(status).toBe(200)
    expect(json.objection).toMatchObject({ style: 'driver', context: 'cardiology', code_switch: true, realism: 0 })
  })

  it('validates style, text and lengths', async () => {
    expect((await add({ style: 'boss' })).status).toBe(400)
    expect((await add({ text_ar: '   ' })).status).toBe(400)
    expect((await add({ text_ar: 'x'.repeat(501) })).status).toBe(400)
    expect((await add({ context: 'x'.repeat(121) })).status).toBe(400)
    expect((await post('not an object')).status).toBe(400)
    expect((await post({ action: 'drop' })).status).toBe(400)
  })

  it('rates 1 to 5 stars on your own entry only', async () => {
    const id = (await add()).json.objection.id
    expect((await post({ action: 'rate', id, realism: 4 })).status).toBe(200)
    expect(rows[0].realism).toBe(4)
    expect((await post({ action: 'rate', id, realism: 1 }, BOB)).status).toBe(404)
    expect(rows[0].realism).toBe(4)
    expect((await post({ action: 'rate', id, realism: 6 })).status).toBe(400)
    expect((await post({ action: 'rate', id, realism: 2.5 })).status).toBe(400)
    expect((await post({ action: 'rate', id: 'x', realism: 3 })).status).toBe(400)
    expect((await post({ action: 'rate', id: randomUUID(), realism: 3 })).status).toBe(404)
  })

  it('rate limits writes', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await add()).status).toBe(429)
    expect(rows).toHaveLength(0)
  })
})
