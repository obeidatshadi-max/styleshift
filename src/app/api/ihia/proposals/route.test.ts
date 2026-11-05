import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/ihia/server', () => ({ ihiaEnabled: () => true, isReviewer: vi.fn() }))
import { GET, PATCH } from './route'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isReviewer } from '@/lib/ihia/server'

afterEach(() => vi.clearAllMocks())
const patchReq = (body: unknown) => new Request('http://localhost/api/ihia/proposals', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

function db(rows: unknown[] = [], updateSpy = vi.fn()) {
  const chain = { in: (..._a: unknown[]) => ({ eq: async (..._b: unknown[]) => { updateSpy(); return { error: null } } }) }
  const table = {
    select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
    update: (patch: unknown) => { updateSpy(patch); return chain },
  }
  // A signed-in user's own client must never touch the table: any read or update through it fails the test.
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'rev-1' } } }) },
    from: () => { throw new Error('the reviewer route must use the server client for proposals') },
  } as never)
  vi.mocked(createAdminClient).mockReturnValue({ from: () => table } as never)
  return updateSpy
}

describe('/api/ihia/proposals', () => {
  it('refuses anyone who is not a reviewer', async () => {
    db(); vi.mocked(isReviewer).mockResolvedValue(false)
    expect((await GET()).status).toBe(403)
    expect((await PATCH(patchReq({ ids: ['a'], action: 'dismissed' }))).status).toBe(403)
  })

  it('groups the same fix made several times and counts the reps', async () => {
    vi.mocked(isReviewer).mockResolvedValue(true)
    db([
      { id: '1', heard: 'وكت', meant: 'وقت', rep_id: 'r1', created_at: '2026-11-05T09:00:00Z' },
      { id: '2', heard: 'وكت', meant: 'وقت', rep_id: 'r2', created_at: '2026-11-05T10:00:00Z' },
      { id: '3', heard: 'وكت', meant: 'وقت', rep_id: 'r1', created_at: '2026-11-05T11:00:00Z' },
      { id: '4', heard: 'شلون', meant: 'شنو', rep_id: 'r1', created_at: '2026-11-05T12:00:00Z' },
    ])
    const { proposals } = await (await GET()).json()
    expect(proposals).toHaveLength(2)
    expect(proposals[0]).toMatchObject({ heard: 'وكت', meant: 'وقت', times: 3, reps: 2 })
    expect(proposals[0].ids.sort()).toEqual(['1', '2', '3'])
  })

  it('never exposes which rep made a correction', async () => {
    vi.mocked(isReviewer).mockResolvedValue(true)
    db([{ id: '1', heard: 'a', meant: 'b', rep_id: 'secret-rep', created_at: '2026-11-05T09:00:00Z' }])
    expect(JSON.stringify(await (await GET()).json())).not.toContain('secret-rep')
  })

  it('validates the patch body and records who handled it', async () => {
    vi.mocked(isReviewer).mockResolvedValue(true)
    const spy = db()
    expect((await PATCH(patchReq({ ids: [], action: 'dismissed' }))).status).toBe(400)
    expect((await PATCH(patchReq({ ids: ['a'], action: 'approved' }))).status).toBe(400)
    expect((await PATCH(patchReq({ ids: ['a'], action: 'drafted' }))).status).toBe(400)
    expect((await PATCH(patchReq({ ids: ['a'], action: 'drafted', entryId: 'e1' }))).status).toBe(200)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: 'drafted', entry_id: 'e1', handled_by: 'rev-1' }))
  })
})
