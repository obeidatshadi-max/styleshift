import { describe, expect, it } from 'vitest'
import { buildWeeklyDigest } from './weekly-digest'

const DAY = 86_400_000
const now = Date.parse('2026-10-10T12:00:00Z')
const ago = (d: number) => new Date(now - d * DAY).toISOString()
const reps = [{ id: 'a', display_name: 'Aya' }, { id: 'b', display_name: 'Bassam' }, { id: 'c', display_name: null }]
const base = { companyName: 'Acme', reps, voiceLastPracticed: {}, focusLabels: [], nowMs: now }

describe('buildWeeklyDigest', () => {
  it('counts this week against last week and names who has been quiet', () => {
    const d = buildWeeklyDigest({ ...base, sessions: [
      { rep_id: 'a', completed_at: ago(1) }, { rep_id: 'a', completed_at: ago(3) }, { rep_id: 'b', completed_at: ago(6.5) },
      { rep_id: 'b', completed_at: ago(9) }, { rep_id: 'a', completed_at: ago(20) }, { rep_id: 'a', completed_at: null },
    ] })
    expect(d).toMatchObject({ practiceThisWeek: 3, practiceLastWeek: 1, activeReps: 2, totalReps: 3, quietReps: ['Unnamed rep'] })
    expect(d.summary).toContain('3 sessions this week (+2 vs last week)')
    expect(d.summary).toContain('Active reps: 2 of 3')
    expect(d.summary).toContain('Not practised this week: Unnamed rep')
  })
  it('counts a rep with recent voice practice as active even with no game sessions', () => {
    const d = buildWeeklyDigest({ ...base, sessions: [], voiceLastPracticed: { c: ago(2), a: ago(30) } })
    expect(d).toMatchObject({ practiceThisWeek: 0, activeReps: 1, quietReps: ['Aya', 'Bassam'] })
    expect(d.summary).toContain('same as last week')
  })
  it('reports a coaching focus only when at least two reps share it', () => {
    expect(buildWeeklyDigest({ ...base, sessions: [], focusLabels: ['Listen step', 'Clarify step'] }).topFocus).toBeNull()
    const d = buildWeeklyDigest({ ...base, sessions: [], focusLabels: ['Listen step', 'Clarify step', 'Listen step'] })
    expect(d.topFocus).toEqual({ label: 'Listen step', count: 2 })
    expect(d.summary).toContain('Most common coaching focus: Listen step (2 reps)')
  })
  it('handles an empty team', () => {
    expect(buildWeeklyDigest({ ...base, reps: [], sessions: [] })).toMatchObject({ totalReps: 0, activeReps: 0, quietReps: [], topFocus: null })
  })
})
