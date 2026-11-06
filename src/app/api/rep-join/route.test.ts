import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({
  createUser: vi.fn(), generateLink: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn(async () => ({ error: null })),
  insert: vi.fn(), deleteProfile: vi.fn(async () => ({ error: null })), calls: [] as string[],
  profile: { data: null as null | { id: string }, error: null as null | { message: string } },
  signIn: vi.fn(async () => ({ error: null })), limit: vi.fn(async (_bucket: string) => true),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: (bucket: string) => m.limit(bucket), clientIp: () => '1.1.1.1' }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { signInWithPassword: m.signIn } }) }))
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    auth: { admin: {
      createUser: m.createUser, generateLink: m.generateLink, deleteUser: m.deleteUser,
      updateUserById: (...a: unknown[]) => { m.calls.push('password'); return m.updateUserById(...a) },
    } },
    from: (table: string) => table === 'companies'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'co-1', name: 'Wafi', plan: 'pro' }, error: null }) }) }) }
      : table === 'profiles'
        ? {
            select: () => ({ eq: () => ({ maybeSingle: async () => m.profile }) }),
            insert: (row: unknown) => { m.calls.push('claim'); return m.insert(row) },
            delete: () => ({ eq: () => m.deleteProfile() }),
          }
        : { insert: async () => ({ error: null }) },
  }),
}))
import { POST } from './route'

afterEach(() => {
  vi.clearAllMocks(); m.calls.length = 0
  m.profile = { data: null, error: null }
  m.limit.mockImplementation(async () => true)
})
const join = (over: Record<string, unknown> = {}) => POST(new Request('http://localhost/api/rep-join', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Attacker', mobile: '0780 563 731', pin: '482913', inviteCode: 'abc', ...over }),
}))
const exists = { error: { message: 'A user with this email address has already been registered' } }
const leftover = () => {
  m.createUser.mockResolvedValue({ data: null, ...exists })
  m.generateLink.mockResolvedValue({ data: { user: { id: 'orphan', created_at: '2020-01-01T00:00:00Z' } }, error: null })
  m.updateUserById.mockResolvedValue({ error: null })
  m.insert.mockResolvedValue({ error: null })
}

describe('POST /api/rep-join: a new rep', () => {
  it('creates the login, claims the profile with an insert, and signs them in', async () => {
    m.createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    m.insert.mockResolvedValue({ error: null })
    const res = await join()
    expect(res.status).toBe(200)
    expect(m.createUser.mock.calls[0][0]).toMatchObject({ email: '0780563731@s.styleshift.rep', password: '482913' })
    expect(m.insert).toHaveBeenCalledWith({ id: 'u1', company_id: 'co-1', role: 'rep', display_name: 'Attacker' })
    expect(m.generateLink).not.toHaveBeenCalled()
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('does NOT delete the login when someone else claimed the profile first: the winner owns it', async () => {
    m.createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    m.insert.mockResolvedValue({ error: { message: 'duplicate key', code: '23505' } })
    const res = await join()
    expect(res.status).toBe(409)
    expect(m.deleteUser).not.toHaveBeenCalled()
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('removes the new login again if the profile cannot be written, so nothing half-made is left', async () => {
    m.createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    m.insert.mockResolvedValue({ error: { message: 'x', code: '500' } })
    expect((await join()).status).toBe(500)
    expect(m.deleteUser).toHaveBeenCalledWith('u1')
  })
})

describe('POST /api/rep-join: a number that already has an account', () => {
  it('does NOT reset the PIN or move an existing rep when someone re-uses the invite link with their number', async () => {
    m.createUser.mockResolvedValue({ data: null, ...exists })
    m.generateLink.mockResolvedValue({ data: { user: { id: 'victim' } }, error: null })
    m.profile = { data: { id: 'victim' }, error: null }
    const res = await join()
    expect(res.status).toBe(409)
    expect(m.updateUserById).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.signIn).not.toHaveBeenCalled()
  })

  it('changes nothing when it cannot tell whether someone owns the login (fails closed)', async () => {
    m.createUser.mockResolvedValue({ data: null, ...exists })
    m.generateLink.mockResolvedValue({ data: { user: { id: 'victim' } }, error: null })
    m.profile = { data: null, error: { message: 'connection reset' } }
    const res = await join()
    expect(res.status).toBe(503)
    expect(m.updateUserById).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('uses wording that does not confirm an account to a stranger', async () => {
    m.createUser.mockResolvedValue({ data: null, ...exists })
    m.generateLink.mockResolvedValue({ data: { user: { id: 'victim' } }, error: null })
    m.profile = { data: { id: 'victim' }, error: null }
    const { error } = await (await join()).json()
    expect(error).toMatch(/could not complete the join/i)
    expect(error).toMatch(/if you already have an account/i)
  })
})

describe('POST /api/rep-join: a leftover login with no profile', () => {
  it('claims the profile FIRST and only then sets the PIN', async () => {
    leftover()
    const res = await join()
    expect(res.status).toBe(200)
    expect(m.calls).toEqual(['claim', 'password'])
    expect(m.updateUserById).toHaveBeenCalledWith('orphan', { password: '482913' })
  })

  it('loses a race cleanly: if someone else claimed it a moment earlier, the PIN is not touched', async () => {
    leftover()
    m.insert.mockResolvedValue({ error: { message: 'duplicate key', code: '23505' } })
    const res = await join()
    expect(res.status).toBe(409)
    expect(m.calls).toEqual(['claim'])
    expect(m.updateUserById).not.toHaveBeenCalled()
    expect(m.deleteUser).not.toHaveBeenCalled()
  })

  it('leaves a login alone that is only seconds old, because another join may still be finishing it', async () => {
    leftover()
    m.generateLink.mockResolvedValue({ data: { user: { id: 'orphan', created_at: new Date(Date.now() - 5000).toISOString() } }, error: null })
    const res = await join()
    expect(res.status).toBe(409)
    expect(m.calls).toEqual([])
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('leaves a login alone when its age cannot be read', async () => {
    leftover()
    m.generateLink.mockResolvedValue({ data: { user: { id: 'orphan' } }, error: null })
    expect((await join()).status).toBe(409)
    expect(m.calls).toEqual([])
  })

  it('takes the profile back if setting the PIN fails', async () => {
    leftover()
    m.updateUserById.mockResolvedValue({ error: { message: 'x' } })
    expect((await join()).status).toBe(500)
    expect(m.deleteProfile).toHaveBeenCalled()
  })
})

describe('POST /api/rep-join: other failures and input', () => {
  it('fails safely on any other account-creation error, without the lookup that can create a user', async () => {
    m.createUser.mockResolvedValue({ data: null, error: { message: 'database exploded' } })
    expect((await join()).status).toBe(500)
    expect(m.generateLink).not.toHaveBeenCalled()
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('still demands a 6-digit PIN and a name', async () => {
    expect((await join({ pin: '12' })).status).toBe(400)
    expect((await join({ name: ' ' })).status).toBe(400)
    expect(m.createUser).not.toHaveBeenCalled()
  })

  it('accepts only a real mobile number, because it becomes part of a login address', async () => {
    for (const mobile of ['abc', '12345', '0780x563731', '0'.repeat(20), 'a@b.com']) expect((await join({ mobile })).status).toBe(400)
    expect(m.createUser).not.toHaveBeenCalled()
  })

  it('limits attempts per number as well as per IP', async () => {
    m.limit.mockImplementation(async (bucket: string) => bucket !== 'rep-join-number')
    expect((await join()).status).toBe(429)
    expect(m.createUser).not.toHaveBeenCalled()
    expect(m.limit.mock.calls.map(c => c[0])).toEqual(['rep-join', 'rep-join-number'])
  })
})
