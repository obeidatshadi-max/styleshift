import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'
const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))
it('allows the bearer-authenticated report function to handle its own authentication', async () => {
  const res = await proxy(new NextRequest('https://style-shift.netlify.app/.netlify/functions/assemblyai-proxy'))
  expect(res.headers.get('location')).toBeNull()
  expect(res.headers.get('x-middleware-next')).toBe('1')
  expect(mocks.createServerClient).not.toHaveBeenCalled()
})
it('lets the hourly reminder trigger reach its route, which checks its own secret', async () => {
  mocks.createServerClient.mockClear()
  const res = await proxy(new NextRequest('https://style-shift.netlify.app/api/push/send', { method: 'POST' }))
  expect(res.headers.get('location')).toBeNull()
  expect(res.headers.get('x-middleware-next')).toBe('1')
  expect(mocks.createServerClient).not.toHaveBeenCalled()
})
