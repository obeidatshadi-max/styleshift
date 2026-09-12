import { describe, it, expect } from 'vitest'
import { detectUnusedResources, type CapabilityUsageRow } from './unused-resource-detector'

function row(overrides: Partial<CapabilityUsageRow>): CapabilityUsageRow {
  return { sessionId: 's1', objectionType: 'doubt', clearStepsHit: [], ...overrides }
}

describe('detectUnusedResources', () => {
  it('returns nothing with fewer than 2 eligible contexts', () => {
    const rows = [
      row({ sessionId: 's1', objectionType: 'doubt', clearStepsHit: ['clarify'] }),
      row({ sessionId: 's2', objectionType: 'doubt', clearStepsHit: ['clarify'] }),
      row({ sessionId: 's3', objectionType: 'doubt', clearStepsHit: ['clarify'] }),
    ]
    expect(detectUnusedResources(rows)).toEqual([])
  })

  it('finds a step proven in one context and unused in another', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `d${i}`, objectionType: 'doubt', clearStepsHit: ['clarify'] })),
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `t${i}`, objectionType: 'true_objection', clearStepsHit: [] })),
    ]
    const findings = detectUnusedResources(rows)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toEqual({
      step: 'clarify',
      provenContext: 'doubt', provenRate: 100, provenSessionCount: 3,
      underusedContext: 'true_objection', underusedRate: 0, underusedSessionCount: 3,
    })
  })

  it('does not flag a step that never reaches the proven threshold anywhere', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `d${i}`, objectionType: 'doubt', clearStepsHit: i === 0 ? ['clarify'] : [] })),
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `t${i}`, objectionType: 'true_objection', clearStepsHit: [] })),
    ]
    // 'clarify' hit in only 1/3 'doubt' sessions (33%) — below the 60% proven threshold.
    expect(detectUnusedResources(rows)).toEqual([])
  })

  it('does not flag a step used consistently everywhere (no underused context)', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `d${i}`, objectionType: 'doubt', clearStepsHit: ['clarify'] })),
      ...Array.from({ length: 3 }, (_, i) => row({ sessionId: `t${i}`, objectionType: 'true_objection', clearStepsHit: ['clarify'] })),
    ]
    expect(detectUnusedResources(rows)).toEqual([])
  })
})
