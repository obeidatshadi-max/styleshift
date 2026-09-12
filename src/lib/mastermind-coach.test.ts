import { describe, expect, it } from 'vitest'
import { buildMastermindInsights } from './mastermind-coach'
import type { BehavioralGravityResult, GravityPattern } from './behavioral-gravity'
import type { UnusedResourceFinding } from './unused-resource-detector'

function gravityPattern(overrides: Partial<GravityPattern> = {}): GravityPattern {
  return {
    trigger: 'doubt', metric: 'avgRepTurnLength', sessionCount: 4,
    triggerAvg: 120, baselineAvg: 80, deviationPct: 50,
    winRate: 25, baselineWinRate: 60, winRateGapPts: 35,
    ...overrides,
  }
}

function gravityResult(patterns: GravityPattern[]): BehavioralGravityResult {
  return { overallSessionCount: 12, overallWinRate: 60, patterns }
}

function unusedFinding(overrides: Partial<UnusedResourceFinding> = {}): UnusedResourceFinding {
  return {
    step: 'clarify',
    provenContext: 'doubt', provenRate: 80, provenSessionCount: 5,
    underusedContext: 'indifference', underusedRate: 10, underusedSessionCount: 4,
    ...overrides,
  }
}

describe('buildMastermindInsights', () => {
  it('returns empty for no gravity and no unused resources', () => {
    expect(buildMastermindInsights(null, [])).toEqual([])
    expect(buildMastermindInsights(gravityResult([]), [])).toEqual([])
  })

  it('builds a gravity insight recommending Listen when reply length swings above baseline', () => {
    const [insight] = buildMastermindInsights(gravityResult([gravityPattern()]), [])
    expect(insight.source).toBe('gravity')
    expect(insight.experiment.focusStep).toBe('listen')
    expect(insight.experiment.objectionType).toBe('doubt')
    expect(insight.evidence).toMatchObject({ trigger: 'doubt', sessionCount: 4, winRateGapPts: 35 })
    expect(insight.impact).toContain('25%')
    expect(insight.impact).toContain('35')
    expect(insight.alternative).toContain('Listen')
  })

  it('recommends Clarify when reply length swings below baseline', () => {
    const [insight] = buildMastermindInsights(
      gravityResult([gravityPattern({ deviationPct: -30, triggerAvg: 50 })]), [],
    )
    expect(insight.experiment.focusStep).toBe('clarify')
    expect(insight.alternative).toContain('Clarify')
  })

  it('recommends Answer when open-question ratio swings above baseline, Clarify when below', () => {
    const above = buildMastermindInsights(
      gravityResult([gravityPattern({ metric: 'openQuestionRatio', deviationPct: 40 })]), [],
    )[0]
    expect(above.experiment.focusStep).toBe('answer')

    const below = buildMastermindInsights(
      gravityResult([gravityPattern({ metric: 'openQuestionRatio', deviationPct: -40 })]), [],
    )[0]
    expect(below.experiment.focusStep).toBe('clarify')
  })

  it('recommends Listen when CLEAR-steps-per-turn swings above baseline, Recheck when below', () => {
    const above = buildMastermindInsights(
      gravityResult([gravityPattern({ metric: 'clearStepsPerTurn', deviationPct: 25 })]), [],
    )[0]
    expect(above.experiment.focusStep).toBe('listen')

    const below = buildMastermindInsights(
      gravityResult([gravityPattern({ metric: 'clearStepsPerTurn', deviationPct: -25 })]), [],
    )[0]
    expect(below.experiment.focusStep).toBe('recheck')
  })

  it('builds an unused-resource insight without fabricating an outcome-based impact', () => {
    const [insight] = buildMastermindInsights(null, [unusedFinding()])
    expect(insight.source).toBe('unused_resource')
    expect(insight.experiment).toEqual({ objectionType: 'indifference', focusStep: 'clarify', label: expect.stringContaining('Indifference') })
    expect(insight.impact).toMatch(/not scored against outcome/i)
    expect(insight.evidence.sessionCount).toBe(9)
  })

  it('lists gravity insights before unused-resource insights', () => {
    const insights = buildMastermindInsights(gravityResult([gravityPattern()]), [unusedFinding()])
    expect(insights.map(i => i.source)).toEqual(['gravity', 'unused_resource'])
  })

  it('preserves multiple gravity patterns in their input order', () => {
    const p1 = gravityPattern({ trigger: 'doubt', winRateGapPts: 40 })
    const p2 = gravityPattern({ trigger: 'true_objection', winRateGapPts: 20 })
    const insights = buildMastermindInsights(gravityResult([p1, p2]), [])
    expect(insights.map(i => i.evidence.trigger)).toEqual(['doubt', 'true_objection'])
  })
})
