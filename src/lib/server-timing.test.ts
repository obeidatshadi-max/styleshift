import { describe, expect, it } from 'vitest'
import { createServerTimer, withServerTiming } from './server-timing'

function clock(steps: number[]) {
  let i = 0
  return () => steps[Math.min(i++, steps.length - 1)]
}

describe('server timer', () => {
  it('records each step and a total', async () => {
    // start=0, step a: 10->35, step b: 40->41, header at 50
    const t = createServerTimer(clock([0, 10, 35, 40, 41, 50]))
    expect(await t.time('auth', () => 'x')).toBe('x')
    await t.time('db', async () => 1)
    expect(t.header()).toBe('auth;dur=25.0, db;dur=1.0, total;dur=50.0')
  })

  it('records the step even when it throws', async () => {
    const t = createServerTimer(clock([0, 0, 5, 9]))
    await expect(t.time('db', () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(t.header()).toBe('db;dur=5.0, total;dur=9.0')
  })

  it('numbers repeated names', () => {
    const t = createServerTimer(clock([0, 3]))
    t.add('db', 1)
    t.add('db', 2)
    expect(t.header()).toBe('db;dur=1.0, db-2;dur=2.0, total;dur=3.0')
  })

  it('refuses names that could carry data', () => {
    const t = createServerTimer()
    expect(() => t.add('user 123@x.com', 1)).toThrow()
  })

  it('prefixes and appends to an existing header', () => {
    const t = createServerTimer(clock([0, 4]))
    t.add('claims', 2)
    const res = new Response('ok', { headers: { 'Server-Timing': 'route;dur=1.0' } })
    withServerTiming(res, t, 'proxy')
    expect(res.headers.get('Server-Timing')).toBe('route;dur=1.0, proxy-claims;dur=2.0, proxy-total;dur=4.0')
  })
})
