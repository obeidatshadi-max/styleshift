import { describe, it, expect } from 'vitest'
import { buildBehavioralTrendsByRep } from './behavioral-trends-dashboard'

function signals(overrides: Partial<{
  avgRepTurnLength: number; openQuestionRatio: number; repTurnCount: number
  clearStepsHitCount: number; clearStepsSequence: string[]
}> = {}) {
  return {
    repTurnCount: 5, avgRepTurnLength: 10, openQuestionRatio: 0.4,
    clearStepsHitCount: 2, clearStepsSequence: ['clarify', 'listen'],
    ...overrides,
  }
}

describe('buildBehavioralTrendsByRep', () => {
  it('returns an entry for every requested rep, even with zero sessions', () => {
    const result = buildBehavioralTrendsByRep(['rep-a', 'rep-b'], [], [])
    expect(result.size).toBe(2)
    expect(result.get('rep-a')).toEqual({ gravity: null, unusedResources: [], mastermindInsights: [] })
    expect(result.get('rep-b')).toEqual({ gravity: null, unusedResources: [], mastermindInsights: [] })
  })

  it('scopes sessions to the correct rep and ignores sessions for reps outside the requested set', () => {
    const sessions = [
      { rep_id: 'rep-a', id: 's1', objection_type: 'doubt', outcome: 'won' },
      { rep_id: 'rep-outside', id: 's2', objection_type: 'doubt', outcome: 'won' },
    ]
    const scorecards = [
      { rep_id: 'rep-a', session_id: 's1', signals: signals() },
      { rep_id: 'rep-outside', session_id: 's2', signals: signals() },
    ]
    const result = buildBehavioralTrendsByRep(['rep-a'], sessions, scorecards)
    expect(result.size).toBe(1)
    expect(result.has('rep-a')).toBe(true)
  })

  it('skips sessions with no matching scorecard or an unrecognized objection type', () => {
    const sessions = [
      { rep_id: 'rep-a', id: 's1', objection_type: 'doubt', outcome: 'won' }, // no scorecard
      { rep_id: 'rep-a', id: 's2', objection_type: 'not_a_real_type', outcome: 'won' },
    ]
    const scorecards = [{ rep_id: 'rep-a', session_id: 's2', signals: signals() }]
    const result = buildBehavioralTrendsByRep(['rep-a'], sessions, scorecards)
    expect(result.get('rep-a')).toEqual({ gravity: null, unusedResources: [], mastermindInsights: [] })
  })

  it('detects an unused-resource finding across two reps independently once enough sessions exist', () => {
    const sessions = [
      ...Array.from({ length: 4 }, (_, i) => ({ rep_id: 'rep-a', id: `a-doubt-${i}`, objection_type: 'doubt', outcome: 'won' as const })),
      ...Array.from({ length: 4 }, (_, i) => ({ rep_id: 'rep-a', id: `a-indiff-${i}`, objection_type: 'indifference', outcome: 'won' as const })),
    ]
    const scorecards = [
      ...sessions.filter(s => s.objection_type === 'doubt').map(s => ({
        rep_id: 'rep-a', session_id: s.id, signals: signals({ clearStepsSequence: ['clarify'] }),
      })),
      ...sessions.filter(s => s.objection_type === 'indifference').map(s => ({
        rep_id: 'rep-a', session_id: s.id, signals: signals({ clearStepsSequence: [] }),
      })),
    ]
    const result = buildBehavioralTrendsByRep(['rep-a', 'rep-b'], sessions, scorecards)
    const findings = result.get('rep-a')!.unusedResources
    expect(findings.some(f => f.step === 'clarify' && f.provenContext === 'doubt' && f.underusedContext === 'indifference')).toBe(true)
    expect(result.get('rep-b')).toEqual({ gravity: null, unusedResources: [], mastermindInsights: [] })
  })
})
