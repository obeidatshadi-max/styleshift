import { describe, it, expect } from 'vitest'
import { dailySince, weeklySince, pickChampion, type XpRow } from './champions-core'

describe('dailySince', () => {
  it('rolls to Baghdad local midnight (UTC+3)', () => {
    // 2026-06-20T23:30:00Z == 2026-06-21T02:30 Baghdad -> since = 2026-06-20T21:00Z
    const since = dailySince(new Date('2026-06-20T23:30:00Z'))
    expect(since.toISOString()).toBe('2026-06-20T21:00:00.000Z')
  })
  it('a pre-midnight-UTC instant still maps to the correct Baghdad day', () => {
    // 2026-06-20T00:30:00Z == 2026-06-20T03:30 Baghdad -> since = 2026-06-19T21:00Z
    const since = dailySince(new Date('2026-06-20T00:30:00Z'))
    expect(since.toISOString()).toBe('2026-06-19T21:00:00.000Z')
  })
})

describe('weeklySince', () => {
  it('rolls back to Baghdad-local Monday 00:00', () => {
    // 2026-06-20 is a Saturday. Monday of that week = 2026-06-15.
    // Baghdad Monday 00:00 = 2026-06-14T21:00Z.
    const since = weeklySince(new Date('2026-06-20T10:00:00Z'))
    expect(since.toISOString()).toBe('2026-06-14T21:00:00.000Z')
  })
})

describe('pickChampion', () => {
  const since = new Date('2026-06-20T21:00:00.000Z')
  it('returns null when no rows in window', () => {
    const rows: XpRow[] = [{ rep_id: 'a', amount: 50, created_at: '2026-06-20T10:00:00Z' }]
    expect(pickChampion(rows, since)).toBeNull()
  })
  it('sums only in-window amounts and picks the highest', () => {
    const rows: XpRow[] = [
      { rep_id: 'a', amount: 30, created_at: '2026-06-20T22:00:00Z' },
      { rep_id: 'a', amount: 20, created_at: '2026-06-20T23:00:00Z' },
      { rep_id: 'b', amount: 40, created_at: '2026-06-20T22:30:00Z' },
      { rep_id: 'b', amount: 10, created_at: '2026-06-20T10:00:00Z' }, // before since, ignored
    ]
    expect(pickChampion(rows, since)).toEqual({ id: 'a', periodXp: 50 })
  })
  it('breaks ties by earliest last-contributing event', () => {
    const rows: XpRow[] = [
      { rep_id: 'a', amount: 50, created_at: '2026-06-20T23:00:00Z' },
      { rep_id: 'b', amount: 50, created_at: '2026-06-20T22:00:00Z' }, // reached 50 earlier
    ]
    expect(pickChampion(rows, since)).toEqual({ id: 'b', periodXp: 50 })
  })
})
