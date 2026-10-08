import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/progress-load', async () => ({
  ...(await vi.importActual<typeof import('@/lib/progress-load')>('@/lib/progress-load')),
  loadProgress: vi.fn(async () => ({ week: { days: 0 } })),
}))

import * as route from './route'
import { createClient } from '@/lib/supabase-server'
import { loadProgress } from '@/lib/progress-load'

const GET = (req: Request) => Promise.resolve(route.GET(req)) as Promise<Response>
const login = (id: string | null) => vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never)
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('GET /api/progress/summary', () => {
  it('looks like a missing route when the flag is off', async () => {
    login('rep')
    expect((await GET(new Request('http://localhost/x'))).status).toBe(404)
    expect(loadProgress).not.toHaveBeenCalled()
  })

  it('requires login', async () => {
    vi.stubEnv('PROGRESS_TRACKING_ENABLED', 'true'); login(null)
    expect((await GET(new Request('http://localhost/x'))).status).toBe(401)
  })

  it('loads only the signed-in rep\'s progress and passes the time zone through (0 when missing or invalid)', async () => {
    vi.stubEnv('PROGRESS_TRACKING_ENABLED', 'true'); login('rep-9')
    await GET(new Request('http://localhost/x?tz=180'))
    expect(vi.mocked(loadProgress).mock.calls[0][1]).toBe('rep-9')
    expect(vi.mocked(loadProgress).mock.calls[0][3]).toBe(180)
    await GET(new Request('http://localhost/x?tz=abc'))
    expect(vi.mocked(loadProgress).mock.calls[1][3]).toBe(0)
  })
})
