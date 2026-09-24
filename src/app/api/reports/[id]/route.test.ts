// src/app/api/reports/[id]/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
import { GET } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => vi.clearAllMocks())

describe('GET /api/reports/[id]', () => {
  it('marks a report outdated when superseded_by is set', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { report: { a: 1 }, superseded_by: 'report-2' }, error: null }) }) }) }),
    } as never)
    const res = await GET(new Request('http://localhost/api/reports/r1'), { params: Promise.resolve({ id: 'r1' }) })
    const body = await res.json()
    expect(body.outdated).toBe(true)
  })
})
