import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { GET, POST } from './route'

const id = '11111111-1111-4111-8111-111111111111'
const post = (body: unknown) => POST(new Request('http://localhost/api/share-with-manager', { method: 'POST', body: JSON.stringify(body) }))
const get = (qs: string) => GET(new Request(`http://localhost/api/share-with-manager?${qs}`))

let user: { id: string } | null
let table: string | null
let updated: Record<string, unknown> | null
let filters: [string, unknown][]
let updateResult: { data: { id: string }[] | null; error: unknown }
let selectResult: { data: { shared_with_manager_at: string | null } | null; error: unknown }
let profileResult: { data: { company_id: string | null } | null; error: unknown }

beforeEach(() => {
  user = { id: 'rep-1' }; table = null; updated = null; filters = []
  profileResult = { data: { company_id: 'company-1' }, error: null }
  updateResult = { data: [{ id }], error: null }
  selectResult = { data: { shared_with_manager_at: null }, error: null }
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
  const chain: any = {
    eq: (col: string, val: unknown) => { filters.push([col, val]); return chain },
    select: async () => updateResult,
    maybeSingle: async () => selectResult,
  }
  const profileChain: any = { eq: () => profileChain, maybeSingle: async () => profileResult }
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t: string) => {
      if (t === 'profiles') return { select: () => profileChain }
      table = t
      return { update: (u: Record<string, unknown>) => { updated = u; return chain }, select: () => chain }
    },
  } as never)
})

describe('POST /api/share-with-manager', () => {
  it('requires sign-in', async () => {
    user = null
    expect((await post({ kind: 'debrief', id, shared: true })).status).toBe(401)
    expect(updated).toBeNull()
  })
  it('rejects malformed input before touching the database', async () => {
    expect((await post({ kind: 'transcript', id, shared: true })).status).toBe(400)
    expect(updated).toBeNull()
  })
  it('limits the write to the signed-in rep\'s own row', async () => {
    const res = await post({ kind: 'debrief', id, shared: true })
    expect(res.status).toBe(200)
    expect(table).toBe('coach_debriefs')
    expect(filters).toEqual([['id', id], ['rep_id', 'rep-1']])
    expect(typeof updated?.shared_with_manager_at).toBe('string')
  })
  it('binds the share to the team the rep is in right now', async () => {
    await post({ kind: 'simulation', id, shared: true })
    expect(updated).toMatchObject({ shared_with_company_id: 'company-1' })
  })
  it('refuses to share when the rep is not in a team, and writes nothing', async () => {
    profileResult = { data: { company_id: null }, error: null }
    const res = await post({ kind: 'debrief', id, shared: true })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'no_manager' })
    expect(updated).toBeNull()
  })
  it('does not need a team to stop sharing, and clears the company too', async () => {
    profileResult = { data: { company_id: null }, error: null }
    const res = await post({ kind: 'debrief', id, shared: false })
    expect(res.status).toBe(200)
    expect(updated).toEqual({ shared_with_manager_at: null, shared_with_company_id: null })
  })
  it('maps simulations to agent_sessions and un-sharing clears the timestamp', async () => {
    const res = await post({ kind: 'simulation', id, shared: false })
    expect(table).toBe('agent_sessions')
    expect(updated).toEqual({ shared_with_manager_at: null, shared_with_company_id: null })
    expect(await res.json()).toEqual({ ok: true, sharedAt: null })
  })
  it('returns 404 when the row is not the rep\'s (nothing updated)', async () => {
    updateResult = { data: [], error: null }
    expect((await post({ kind: 'debrief', id, shared: true })).status).toBe(404)
  })
  it('reports a database failure instead of pretending it worked', async () => {
    updateResult = { data: null, error: { code: 'x' } }
    expect((await post({ kind: 'debrief', id, shared: true })).status).toBe(500)
  })
  it('respects the rate limit', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await post({ kind: 'debrief', id, shared: true })).status).toBe(429)
    expect(updated).toBeNull()
  })
})

describe('GET /api/share-with-manager', () => {
  it('returns the current state only for the rep\'s own item', async () => {
    selectResult = { data: { shared_with_manager_at: '2026-11-03T09:00:00Z' }, error: null }
    const res = await get(`kind=simulation&id=${id}`)
    expect(await res.json()).toEqual({ sharedAt: '2026-11-03T09:00:00Z' })
    expect(filters).toEqual([['id', id], ['rep_id', 'rep-1']])
  })
  it('404s for someone else\'s item and 400s for bad input', async () => {
    selectResult = { data: null, error: null }
    expect((await get(`kind=debrief&id=${id}`)).status).toBe(404)
    expect((await get('kind=debrief&id=nope')).status).toBe(400)
  })
})
