import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ createUser: vi.fn(), deleteUser: vi.fn(), insert: vi.fn(async () => ({ error: null })) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true), clientIp: () => '1.1.1.1' }))
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser: m.createUser, deleteUser: m.deleteUser } }, from: () => ({ insert: m.insert }) }),
}))
import { POST as repSignup } from './rep-signup/route'
import { POST as managerSignup } from './manager-signup/route'

afterEach(() => vi.clearAllMocks())
const req = (body: unknown) => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe.each([['rep-signup', repSignup], ['manager-signup', managerSignup]])('%s', (_name, handler) => {
  it('will not register an address on the reserved PIN-login domain, which would claim a colleague\'s mobile number in advance', async () => {
    for (const email of ['0780563731@s.styleshift.rep', ' 0780563731@S.StyleShift.Rep ']) {
      const res = await handler(req({ email, password: 'abcdef' }))
      expect(res.status).toBe(400)
    }
    expect(m.createUser).not.toHaveBeenCalled()
  })

  it('still registers an ordinary email', async () => {
    m.createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await handler(req({ email: 'person@example.com', password: 'abcdef' }))
    expect(res.status).toBe(200)
    expect(m.createUser).toHaveBeenCalled()
  })
})
