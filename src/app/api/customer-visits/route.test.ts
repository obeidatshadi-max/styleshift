// src/app/api/customer-visits/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => vi.clearAllMocks())

function mockSupabase(userId = 'rep-1') {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'visit-1' }, error: null }) }) }))
  return { auth: { getUser: async () => ({ data: { user: { id: userId } } }) }, from: () => ({ insert }) }
}

const request = (body: unknown) => new Request('http://localhost/api/customer-visits', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('POST /api/customer-visits', () => {
  it('rejects a request that does not confirm consent', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ consent: false }))
    expect(res.status).toBe(400)
  })
  it('creates a visit when consent is confirmed', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ consent: true, objective: 'Confirm formulary switch', retentionPolicy: 'discard_after_report' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('visit-1')
  })
})
