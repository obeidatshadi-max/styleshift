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
it('serves the classroom arena page and its self-authenticating API without a session', () => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/arena.html' })).toBe(false)
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/api/arena' })).toBe(false)
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/api/arena/photo' })).toBe(false)
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/api/assignments' })).toBe(true)
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/dashboard' })).toBe(true)
})
it('lets anyone open a certificate check page, while other pages still need a session', async () => {
  mocks.createServerClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
  const verify = await proxy(new NextRequest('https://style-shift.netlify.app/verify/ABCDEFGHJKMN'))
  expect(verify.headers.get('location')).toBeNull()
  const dashboard = await proxy(new NextRequest('https://style-shift.netlify.app/dashboard'))
  expect(dashboard.headers.get('location')).toContain('/login')
})
it('shows the home page at /welcome to anyone, signed in or not', async () => {
  mocks.createServerClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
  const res = await proxy(new NextRequest('https://style-shift.netlify.app/welcome'))
  expect(res.headers.get('location')).toBeNull()
})
