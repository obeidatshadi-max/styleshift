import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/capability-load', async () => {
  const actual = await vi.importActual<typeof import('@/lib/capability-load')>('@/lib/capability-load')
  return { ...actual, loadCapabilityReport: vi.fn(async () => ({ configVersion: '1.0.0', sessionsConsidered: 0, dimensions: {} })) }
})

import { GET } from './route'
import { createClient } from '@/lib/supabase-server'
import { loadCapabilityReport } from '@/lib/capability-load'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
const login = (id: string | null) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never)

describe('GET /api/progress/capability', () => {
  it('looks like a missing route when the flag is off', async () => {
    login('rep')
    expect((await GET()).status).toBe(404)
    expect(loadCapabilityReport).not.toHaveBeenCalled()
  })
  it('requires login', async () => {
    vi.stubEnv('CAPABILITY_IQ_ENABLED', 'true'); login(null)
    expect((await GET()).status).toBe(401)
  })
  it('returns only the signed-in rep\'s own report', async () => {
    vi.stubEnv('CAPABILITY_IQ_ENABLED', 'true'); login('rep-7')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(vi.mocked(loadCapabilityReport).mock.calls[0][1]).toBe('rep-7')
  })
})
