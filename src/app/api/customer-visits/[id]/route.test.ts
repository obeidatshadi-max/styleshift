// src/app/api/customer-visits/[id]/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))

import { PATCH } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => vi.clearAllMocks())

function mockSupabase(singleResult: { data: unknown; error: unknown }, userId = 'rep-1') {
  const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: async () => singleResult }) }) }))
  return { auth: { getUser: async () => ({ data: { user: { id: userId } } }) }, from: () => ({ update }), __update: update }
}

const request = (body: unknown) => new Request('http://localhost/api/customer-visits/visit-1', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const ctx = { params: Promise.resolve({ id: 'visit-1' }) }

describe('PATCH /api/customer-visits/[id]', () => {
  it('updates status when a valid value is given', async () => {
    const supabase = mockSupabase({ data: { id: 'visit-1' }, error: null })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await PATCH(request({ status: 'ready' }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(supabase.__update).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }))
  })

  it('rejects an invalid status value without touching the DB', async () => {
    const supabase = mockSupabase({ data: { id: 'visit-1' }, error: null })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await PATCH(request({ status: 'bogus' }), ctx)
    expect(res.status).toBe(400)
    expect(supabase.__update).not.toHaveBeenCalled()
  })

  it('returns 404 when RLS blocks the update (no row returned)', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'no rows' } })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await PATCH(request({ status: 'ready' }), ctx)
    expect(res.status).toBe(404)
  })
})
