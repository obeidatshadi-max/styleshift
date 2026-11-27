import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { L1, XP_VALUES } from '@/lib/game-data'

const req = (body: unknown) => new Request('http://localhost/api/game/level-complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const perfectL1 = L1.slice(0, 6).map(s => ({ id: s.id, pick: s.style, ms: 5000 }))

let sessions: Record<string, unknown>[]
let rpcCalls: Array<[string, Record<string, unknown>]>
let badgeRows: Record<string, unknown>[]

beforeEach(() => {
  sessions = []; rpcCalls = []; badgeRows = []
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) } } as never)
  vi.mocked(createAdminClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'sessions') return { insert: async (row: Record<string, unknown>) => { sessions.push(row); return { error: null } } }
      if (table === 'badges') return { upsert: (rows: Record<string, unknown>[]) => { badgeRows.push(...rows); return { select: async () => ({ data: rows, error: null }) } } }
      throw new Error(table)
    },
    rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push([name, args]); return { data: 300, error: null } },
  } as never)
})
afterEach(() => vi.clearAllMocks())

describe('POST /api/game/level-complete', () => {
  it('scores the picks on the server and stores that score, not anything the browser claims', async () => {
    const res = await POST(req({ level: 1, lang: 'en', answers: perfectL1, accuracy: 0, xp: 99999 }))
    expect(res.status).toBe(200)
    const xp = 6 * XP_VALUES.correct + XP_VALUES.perfectLevel + XP_VALUES.levelComplete
    expect(sessions).toEqual([expect.objectContaining({ rep_id: 'rep-1', level: 1, accuracy: 100, xp_earned: xp })])
    expect(rpcCalls).toEqual([['award_xp', { p_rep: 'rep-1', p_amount: xp, p_source: 'session' }]])
    expect(badgeRows.map(b => b.badge_name)).toContain('First Scan')
  })

  it('refuses a run a real game cannot produce and stores nothing', async () => {
    const res = await POST(req({ level: 1, lang: 'en', answers: perfectL1.slice(0, 2) }))
    expect(res.status).toBe(400)
    expect(sessions).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  it('refuses signed-out callers', async () => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await POST(req({ level: 1, lang: 'en', answers: perfectL1 }))).status).toBe(401)
  })
})
