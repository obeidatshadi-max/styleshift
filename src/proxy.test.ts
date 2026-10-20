import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'
import { config } from './proxy'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))
it('serves public fonts without authentication while protecting app and API routes', () => {
  for (const url of ['/fonts/plus-jakarta-sans-latin.woff2', '/fonts/ibm-plex-sans-arabic-400.woff2']) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false)
  }
  for (const url of ['/play', '/dashboard', '/api/reports/private-id']) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true)
  }
})
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
