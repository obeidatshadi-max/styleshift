import { describe, expect, it, vi } from 'vitest'
import { getAuthUser } from './auth-user'

describe('getAuthUser', () => {
  it('reads the user from verified claims without calling the Auth server', async () => {
    const getUser = vi.fn()
    const client = { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1', email: 'a@b.co' } } }), getUser } }
    expect(await getAuthUser(client)).toEqual({ id: 'u1', email: 'a@b.co' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('returns null when there is no valid session', async () => {
    const getUser = vi.fn()
    expect(await getAuthUser({ auth: { getClaims: vi.fn().mockResolvedValue({ data: null }), getUser } })).toBeNull()
    expect(await getAuthUser({ auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: '' } } }), getUser } })).toBeNull()
    expect(await getAuthUser({ auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 7 } } }), getUser } })).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('leaves email out when the token has none', async () => {
    const client = { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u2' } } }), getUser: vi.fn() } }
    expect(await getAuthUser(client)).toEqual({ id: 'u2' })
  })

  it('falls back to getUser for clients without getClaims', async () => {
    expect(await getAuthUser({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u3', email: null } } }) } })).toEqual({ id: 'u3' })
    expect(await getAuthUser({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })).toBeNull()
  })
})
