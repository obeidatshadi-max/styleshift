import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({
  createUser: vi.fn(), generateLink: vi.fn(), updateUserById: vi.fn(), upsert: vi.fn(async () => ({ error: null })),
  existingProfile: null as null | { id: string }, signIn: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true), clientIp: () => '1.1.1.1' }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { signInWithPassword: m.signIn } }) }))
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: m.createUser, generateLink: m.generateLink, updateUserById: m.updateUserById } },
    from: (table: string) => table === 'companies'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'co-1', name: 'Wafi', plan: 'pro' }, error: null }) }) }) }
      : table === 'profiles'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.existingProfile }) }) }), upsert: m.upsert }
        : { insert: async () => ({ error: null }) },
  }),
}))
import { POST } from './route'

afterEach(() => { vi.clearAllMocks(); m.existingProfile = null })
const join = (over: Record<string, unknown> = {}) => POST(new Request('http://localhost/api/rep-join', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Attacker', mobile: '0780 563 731', pin: '482913', inviteCode: 'abc', ...over }),
}))
const exists = { error: { message: 'A user with this email address has already been registered' } }

describe('POST /api/rep-join', () => {
  it('creates a new rep and joins them to the company', async () => {
    m.createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await join()
    expect(res.status).toBe(200)
    expect(m.createUser.mock.calls[0][0]).toMatchObject({ email: '0780563731@s.styleshift.rep', password: '482913' })
    expect(m.generateLink).not.toHaveBeenCalled()
    expect(m.upsert).toHaveBeenCalled()
  })

  it('does NOT reset the PIN or move an existing rep when someone re-uses the invite link with their number', async () => {
    m.createUser.mockResolvedValue({ data: null, ...exists })
    m.generateLink.mockResolvedValue({ data: { user: { id: 'victim' } }, error: null })
    m.existingProfile = { id: 'victim' }
    const res = await join()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already has an account/)
    expect(m.updateUserById).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.signIn).not.toHaveBeenCalled()
  })

  it('still finishes a leftover login that never got a profile, because nobody is locked out', async () => {
    m.createUser.mockResolvedValue({ data: null, ...exists })
    m.generateLink.mockResolvedValue({ data: { user: { id: 'orphan' } }, error: null })
    m.updateUserById.mockResolvedValue({ error: null })
    m.existingProfile = null
    const res = await join()
    expect(res.status).toBe(200)
    expect(m.updateUserById).toHaveBeenCalledWith('orphan', { password: '482913' })
    expect(m.upsert).toHaveBeenCalled()
  })

  it('fails safely on any other account-creation error, without the lookup that can create a user', async () => {
    m.createUser.mockResolvedValue({ data: null, error: { message: 'database exploded' } })
    const res = await join()
    expect(res.status).toBe(500)
    expect(m.generateLink).not.toHaveBeenCalled()
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('still demands a 6-digit PIN and a name', async () => {
    expect((await join({ pin: '12' })).status).toBe(400)
    expect((await join({ name: ' ' })).status).toBe(400)
    expect(m.createUser).not.toHaveBeenCalled()
  })
})
