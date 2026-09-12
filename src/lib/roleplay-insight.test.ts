import { describe, it, expect } from 'vitest'
import { buildRoleplayInsight } from './roleplay-insight'
import type { RoleplayResult } from './roleplay-core'

function result(overrides: Partial<RoleplayResult> = {}): RoleplayResult {
  return {
    talkRatio: { repMs: 5000, partnerMs: 5000, totalMs: 10000, repRatio: 0.5 },
    rapidTurnSwitches: 0,
    questionRatio: 0.3,
    openQuestionRatio: 0.5,
    paraphraseScore: 0.4,
    activeListening: { score: 80, label: 'excellent' },
    repRead: null,
    partnerRead: null,
    adaptationScore: null,
    durationSec: 60,
    warmth: 0,
    predicates: { visual: 0, auditory: 0, kinesthetic: 0, dominant: null },
    ...overrides,
  }
}

describe('buildRoleplayInsight', () => {
  it('returns null for a solid session on every metric', () => {
    expect(buildRoleplayInsight(result())).toBeNull()
  })

  it('flags a talk ratio over the threshold first, ahead of other issues', () => {
    const r = result({
      talkRatio: { repMs: 7000, partnerMs: 3000, totalMs: 10000, repRatio: 0.7 },
      questionRatio: 0.1, // would also trigger, but talkRatio has priority
    })
    const insight = buildRoleplayInsight(r)
    expect(insight).toEqual({ metric: 'talkRatio', value: 70 })
  })

  it('flags a low adaptation score when talk ratio is fine', () => {
    const r = result({ adaptationScore: { score: 30, label: 'mismatched' } })
    expect(buildRoleplayInsight(r)).toEqual({ metric: 'adaptationScore', value: 30 })
  })

  it('flags a low question ratio', () => {
    const r = result({ questionRatio: 0.1 })
    expect(buildRoleplayInsight(r)).toEqual({ metric: 'questionRatio', value: 10 })
  })

  it('flags a low open-question ratio only when question ratio itself is fine', () => {
    const r = result({ questionRatio: 0.3, openQuestionRatio: 0.1 })
    expect(buildRoleplayInsight(r)).toEqual({ metric: 'openQuestionRatio', value: 10 })
  })

  it('flags a low paraphrase score', () => {
    const r = result({ paraphraseScore: 0.05 })
    expect(buildRoleplayInsight(r)).toEqual({ metric: 'paraphraseScore', value: 5 })
  })

  it('flags a low active listening score', () => {
    const r = result({ activeListening: { score: 30, label: 'developing' } })
    expect(buildRoleplayInsight(r)).toEqual({ metric: 'activeListening', value: 30 })
  })

  it('flags a high rapid-switch rate last', () => {
    const r = result({ rapidTurnSwitches: 14, durationSec: 60 }) // 14/min
    expect(buildRoleplayInsight(r)).toEqual({ metric: 'rapidSwitches', value: 14 })
  })
})
