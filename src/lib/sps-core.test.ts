import { describe, it, expect } from 'vitest'
import { scoreSps, SPS_OPPOSITE } from './sps-core'

describe('scoreSps', () => {
  it('picks the dominant style, flags a strong margin, and reads compliance risk as elevated when every answer is A', () => {
    const answers = new Array(16).fill(0) // option A on every question = "go" on all 14 style Qs, risk 2 on both compliance Qs
    const r = scoreSps(answers)
    expect(r.scores).toEqual({ go: 14, connect: 0, plan: 0, support: 0 })
    expect(r.styleTotal).toBe(14)
    expect(r.topKey).toBe('go')
    expect(r.margin).toBe(14)
    expect(r.marginLevel).toBe('strong')
    expect(r.balanced).toBe(false)
    expect(r.complianceRisk).toBe(4)
    expect(r.complianceMax).toBe(4)
    expect(r.complianceLevel).toBe('elevated')
    expect(r.oppositeKey).toBe(SPS_OPPOSITE['go'])
    expect(r.oppositeKey).toBe('support')
  })

  it('detects a balanced, flexible profile with low compliance risk', () => {
    const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 2, 2, 0, 1]
    // non-compliance picks (idx 0-11, 14-15): go x4, connect x4, plan x3, support x3
    // compliance picks (idx 12-13): both "C" -> risk 0
    const r = scoreSps(answers)
    expect(r.scores).toEqual({ go: 4, connect: 4, plan: 3, support: 3 })
    expect(r.styleTotal).toBe(14)
    expect(r.topKey).toBe('go') // tie at 4, "go" wins the order tie-break
    expect(r.margin).toBe(0)
    expect(r.marginLevel).toBe('flexible')
    expect(r.balanced).toBe(true) // sorted[0]-sorted[3] = 4-3 = 1 <= 3
    expect(r.complianceRisk).toBe(0)
    expect(r.complianceLevel).toBe('low')
  })

  it('reads a margin of exactly 3 as moderate, not strong, and as not balanced', () => {
    const answers = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]
    // non-compliance (idx 0-11,14,15): go x6, connect x3, plan x3, support x2
    const r = scoreSps(answers)
    expect(r.scores).toEqual({ go: 6, connect: 3, plan: 3, support: 2 })
    expect(r.topKey).toBe('go')
    expect(r.margin).toBe(3) // 6 - 3
    expect(r.marginLevel).toBe('moderate')
    expect(r.balanced).toBe(false) // 6 - 2 = 4 > 3
  })

  it('reads a compliance risk of exactly 2 as moderate, not elevated', () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0]
    // compliance idx 12 -> option A (risk 2), idx 13 -> option C (risk 0) => total risk 2
    const r = scoreSps(answers)
    expect(r.complianceRisk).toBe(2)
    expect(r.complianceMax).toBe(4)
    expect(r.complianceLevel).toBe('moderate')
  })
})
