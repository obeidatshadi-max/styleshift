import { describe, it, expect } from 'vitest'
import { computeBehavioralGravity, type GravitySessionRow } from './behavioral-gravity'

function row(overrides: Partial<GravitySessionRow>): GravitySessionRow {
  return {
    sessionId: 's1', objectionType: 'doubt', outcome: 'won', adaptationScore: 70,
    avgRepTurnLength: 20, openQuestionRatio: 0.5, clearStepsPerTurn: 1,
    ...overrides,
  }
}

describe('computeBehavioralGravity', () => {
  it('returns null with fewer than 3 sessions total', () => {
    const rows = [row({ sessionId: 's1' }), row({ sessionId: 's2' })]
    expect(computeBehavioralGravity(rows)).toBeNull()
  })

  it('returns no patterns when no trigger group has enough sessions', () => {
    const rows = [
      row({ sessionId: 's1', objectionType: 'doubt' }),
      row({ sessionId: 's2', objectionType: 'true_objection' }),
      row({ sessionId: 's3', objectionType: 'indifference' }),
    ]
    const result = computeBehavioralGravity(rows)
    expect(result).not.toBeNull()
    expect(result!.patterns).toEqual([])
  })

  it('does not flag a trigger group that performs BETTER than baseline', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `d${i}`, objectionType: 'doubt', outcome: 'won' })),
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `t${i}`, objectionType: 'true_objection', outcome: 'escalated', avgRepTurnLength: 60 })),
    ]
    const result = computeBehavioralGravity(rows)!
    // 'doubt' group wins 100% vs overall 50% baseline — a positive gap, not
    // a worse-consequence pattern, so it must never be reported.
    expect(result.patterns.find(p => p.trigger === 'doubt')).toBeUndefined()
  })

  it('flags a trigger group with both a real behavioral deviation and a worse win rate', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `d${i}`, objectionType: 'doubt', outcome: 'won', avgRepTurnLength: 20 })),
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `t${i}`, objectionType: 'true_objection', outcome: 'escalated', avgRepTurnLength: 60 })),
    ]
    const result = computeBehavioralGravity(rows)!
    expect(result.overallSessionCount).toBe(6)
    expect(result.overallWinRate).toBe(50)
    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.trigger).toBe('true_objection')
    expect(p.metric).toBe('avgRepTurnLength')
    expect(p.sessionCount).toBe(3)
    expect(p.triggerAvg).toBe(60)
    expect(p.baselineAvg).toBe(40)
    expect(p.deviationPct).toBe(50)
    expect(p.winRate).toBe(0)
    expect(p.baselineWinRate).toBe(50)
    expect(p.winRateGapPts).toBe(50)
  })

  it('does not flag a trigger group with a worse win rate but no real behavioral deviation', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `d${i}`, objectionType: 'doubt', outcome: 'won' })),
      // Same avgRepTurnLength/openQuestionRatio/clearStepsPerTurn as baseline — only outcome differs.
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `t${i}`, objectionType: 'true_objection', outcome: 'escalated' })),
    ]
    const result = computeBehavioralGravity(rows)!
    expect(result.patterns).toEqual([])
  })
})
