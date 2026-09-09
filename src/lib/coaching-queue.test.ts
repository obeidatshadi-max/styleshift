import { describe, it, expect } from 'vitest'
import { buildCoachingQueue, type CoachingQueueInput } from './coaching-queue'

const NOW = new Date('2026-09-09T12:00:00Z').getTime()

function input(overrides: Partial<CoachingQueueInput>): CoachingQueueInput {
  return {
    rep_id: 'rep1', name: 'Rep One', avgAccuracy: 80, lastVisit: '2026-09-09',
    isLowAccuracy: false, isAssignmentOverdue: false, hasVoicePractice: true, levelAccuracies: [],
    ...overrides,
  }
}

describe('buildCoachingQueue', () => {
  it('drops a rep with no flags', () => {
    const out = buildCoachingQueue([input({})], NOW)
    expect(out).toEqual([])
  })

  it('flags low accuracy', () => {
    const out = buildCoachingQueue([input({ isLowAccuracy: true })], NOW)
    expect(out[0].flags).toEqual(['low_accuracy'])
  })

  it('flags inactivity at 3+ days', () => {
    const out = buildCoachingQueue([input({ lastVisit: '2026-09-06' })], NOW)
    expect(out[0].flags).toEqual(['inactive'])
  })

  it('does not flag inactivity under 3 days', () => {
    const out = buildCoachingQueue([input({ lastVisit: '2026-09-07' })], NOW)
    expect(out).toEqual([])
  })

  it('flags a rep who has never visited (null last visit) as inactive', () => {
    const out = buildCoachingQueue([input({ lastVisit: null })], NOW)
    expect(out[0].flags).toEqual(['inactive'])
  })

  it('flags an overdue assignment', () => {
    const out = buildCoachingQueue([input({ isAssignmentOverdue: true })], NOW)
    expect(out[0].flags).toEqual(['assignment_overdue'])
  })

  it('flags no voice practice', () => {
    const out = buildCoachingQueue([input({ hasVoicePractice: false })], NOW)
    expect(out[0].flags).toEqual(['no_voice_practice'])
  })

  it('ranks more flags above fewer flags', () => {
    const out = buildCoachingQueue([
      input({ rep_id: 'a', isLowAccuracy: true }),
      input({ rep_id: 'b', isLowAccuracy: true, hasVoicePractice: false, isAssignmentOverdue: true }),
    ], NOW)
    expect(out.map(e => e.rep_id)).toEqual(['b', 'a'])
  })

  it('breaks a flag-count tie with lower accuracy first', () => {
    const out = buildCoachingQueue([
      input({ rep_id: 'a', isLowAccuracy: true, avgAccuracy: 65 }),
      input({ rep_id: 'b', isLowAccuracy: true, avgAccuracy: 40 }),
    ], NOW)
    expect(out.map(e => e.rep_id)).toEqual(['b', 'a'])
  })

  it('suggests the level with the worst average accuracy', () => {
    const out = buildCoachingQueue([input({
      isLowAccuracy: true,
      levelAccuracies: [{ level: 1, avg: 90 }, { level: 2, avg: 40 }, { level: 3, avg: 70 }],
    })], NOW)
    expect(out[0].suggestedLevel).toBe(2)
  })

  it('suggests level 1 when the rep has no session history at all', () => {
    const out = buildCoachingQueue([input({ isLowAccuracy: true, levelAccuracies: [] })], NOW)
    expect(out[0].suggestedLevel).toBe(1)
  })

  it('caps the queue at 6 entries', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => input({ rep_id: `rep${i}`, isLowAccuracy: true }))
    const out = buildCoachingQueue(inputs, NOW)
    expect(out).toHaveLength(6)
  })
})
