import { describe, it, expect } from 'vitest'
import { rankTeams, type LeagueXpRow } from './leagues-core'

const since = new Date('2026-06-15T21:00:00.000Z') // Baghdad Monday 00:00

describe('rankTeams', () => {
  it('ranks by average XP per rep, so a small team can beat a big one', () => {
    const rows: LeagueXpRow[] = [
      // team A: 2 reps, 100 total -> avg 50
      { rep_id: 'a1', amount: 60, created_at: '2026-06-16T08:00:00Z' },
      { rep_id: 'a2', amount: 40, created_at: '2026-06-16T08:00:00Z' },
      // team B: 4 reps, 160 total -> avg 40
      { rep_id: 'b1', amount: 100, created_at: '2026-06-16T08:00:00Z' },
      { rep_id: 'b2', amount: 60, created_at: '2026-06-16T08:00:00Z' },
    ]
    const repCounts = new Map([['A', 2], ['B', 4]])
    const repByCompany = new Map([['a1', 'A'], ['a2', 'A'], ['b1', 'B'], ['b2', 'B']])
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out.map(t => [t.companyId, t.avgXp, t.rank])).toEqual([
      ['A', 50, 1],
      ['B', 40, 2],
    ])
  })

  it('excludes a team with zero reps (no divide-by-zero)', () => {
    const rows: LeagueXpRow[] = [{ rep_id: 'a1', amount: 30, created_at: '2026-06-16T08:00:00Z' }]
    const repCounts = new Map([['A', 1], ['Z', 0]])
    const repByCompany = new Map([['a1', 'A']])
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out.map(t => t.companyId)).toEqual(['A'])
  })

  it('ignores rows before the window start', () => {
    const rows: LeagueXpRow[] = [
      { rep_id: 'a1', amount: 30, created_at: '2026-06-16T08:00:00Z' },
      { rep_id: 'a1', amount: 999, created_at: '2026-06-10T08:00:00Z' }, // before since
    ]
    const repCounts = new Map([['A', 1]])
    const repByCompany = new Map([['a1', 'A']])
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out[0].avgXp).toBe(30)
  })

  it('a zero-XP team still appears with avg 0, ties broken by companyId', () => {
    const rows: LeagueXpRow[] = []
    const repCounts = new Map([['B', 3], ['A', 2]])
    const repByCompany = new Map<string, string>()
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out.map(t => [t.companyId, t.avgXp, t.rank])).toEqual([
      ['A', 0, 1],
      ['B', 0, 2],
    ])
  })
})
