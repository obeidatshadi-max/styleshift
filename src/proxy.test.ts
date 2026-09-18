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
