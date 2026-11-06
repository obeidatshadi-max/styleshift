import { afterEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchange: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { verifyOtp: m.verifyOtp, exchangeCodeForSession: m.exchange } }) }))
import { GET } from './route'
import { NextRequest } from 'next/server'

afterEach(() => vi.clearAllMocks())
const call = (qs: string) => GET(new NextRequest(`http://localhost/auth/confirm?${qs}`))
const where = (res: Response) => new URL(res.headers.get('location')!)

describe('GET /auth/confirm', () => {
  it('signs a valid reset link in and goes on to the reset page', async () => {
    m.verifyOtp.mockResolvedValue({ error: null })
    const res = await call('token_hash=abc&type=recovery&next=/reset-password')
    expect(where(res).pathname).toBe('/reset-password')
  })

  it('a failed reset link goes to sign-in with the reset wording', async () => {
    m.verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    const url = where(await call('token_hash=abc&type=recovery&next=/reset-password'))
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('confirm_error')).toBe('reset')
  })

  it('a failed sign-up link keeps the activation wording', async () => {
    m.verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    expect(where(await call('token_hash=abc&type=email&next=/play')).searchParams.get('confirm_error')).toBe('1')
  })
})
