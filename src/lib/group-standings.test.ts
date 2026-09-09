import { describe, it, expect } from 'vitest'
import { rankGroupMembers, canJoinGroup, MAX_GROUP_MEMBERS } from './group-standings'

describe('rankGroupMembers', () => {
  it('ranks members by XP, highest first', () => {
    const rows = [
      { id: 'a', display_name: 'A', xp: 40 },
      { id: 'b', display_name: 'B', xp: 90 },
      { id: 'c', display_name: 'C', xp: 10 },
    ]
    const out = rankGroupMembers(rows, 'c')
    expect(out.standings.map(s => s.id)).toEqual(['b', 'a', 'c'])
    expect(out.selfRank).toBe(3)
    expect(out.teamSize).toBe(3)
  })

  it('falls back to null xp/name safely', () => {
    const rows = [{ id: 'a', display_name: null, xp: null }]
    const out = rankGroupMembers(rows, 'a')
    expect(out.standings[0]).toEqual({ id: 'a', name: 'Rep', xp: 0, isSelf: true })
  })

  it('selfRank is null when the caller is not among the rows', () => {
    const rows = [{ id: 'a', display_name: 'A', xp: 5 }]
    const out = rankGroupMembers(rows, 'someone-else')
    expect(out.selfRank).toBeNull()
  })
})

describe('canJoinGroup', () => {
  it('allows joining below the cap', () => {
    expect(canJoinGroup(MAX_GROUP_MEMBERS - 1)).toBe(true)
  })

  it('blocks joining at or above the cap', () => {
    expect(canJoinGroup(MAX_GROUP_MEMBERS)).toBe(false)
    expect(canJoinGroup(MAX_GROUP_MEMBERS + 1)).toBe(false)
  })
})
