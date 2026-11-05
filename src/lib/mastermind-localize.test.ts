import { describe, expect, it } from 'vitest'
import { buildMastermindInsights } from '@/lib/mastermind-coach'
import { localizeInsight } from '@/lib/mastermind-localize'
import type { BehavioralGravityResult, GravityPattern } from '@/lib/behavioral-gravity'
import type { UnusedResourceFinding } from '@/lib/unused-resource-detector'

const pattern = (over: Partial<GravityPattern> = {}): GravityPattern => ({
  trigger: 'doubt', metric: 'avgRepTurnLength', triggerAvg: 40, baselineAvg: 25, deviationPct: 60,
  sessionCount: 4, winRate: 25, baselineWinRate: 60, winRateGapPts: 35, ...over,
} as GravityPattern)
const gravity = (patterns: GravityPattern[]): BehavioralGravityResult =>
  ({ patterns, overallSessionCount: 10, baselineWinRate: 60 } as unknown as BehavioralGravityResult)
const unused: UnusedResourceFinding = {
  step: 'empathy', provenContext: 'wrong_info', provenRate: 80, provenSessionCount: 5,
  underusedContext: 'doubt', underusedRate: 10, underusedSessionCount: 6,
} as UnusedResourceFinding

const hasArabic = (s: string) => /[؀-ۿ]/.test(s)
const hasLatinWord = (s: string) => /[A-Za-z]{3,}/.test(s.replace(/CLEAR/g, ''))

describe('localizeInsight', () => {
  it('returns the English insight untouched for en', () => {
    const [i] = buildMastermindInsights(gravity([pattern()]), [])
    expect(localizeInsight(i, 'en')).toBe(i)
  })

  it('writes every field of a gravity insight in Arabic, keeping the numbers from the evidence', () => {
    const [i] = buildMastermindInsights(gravity([pattern()]), [])
    const ar = localizeInsight(i, 'ar')
    for (const f of [ar.observation, ar.pattern, ar.impact, ar.alternative, ar.experiment.label]) {
      expect(hasArabic(f)).toBe(true)
      expect(hasLatinWord(f)).toBe(false)
    }
    expect(ar.impact).toContain('25%')
    expect(ar.impact).toContain('35')
    expect(ar.impact).toContain('60%')
    expect(ar.pattern).toContain('4')
    expect(ar.evidence).toEqual(i.evidence)
    expect(ar.experiment.objectionType).toBe(i.experiment.objectionType)
    expect(ar.experiment.focusStep).toBe(i.experiment.focusStep)
  })

  it('picks the wording by metric and direction', () => {
    const cases: [GravityPattern, string][] = [
      [pattern({ metric: 'avgRepTurnLength', deviationPct: 50 }), 'الإسهاب'],
      [pattern({ metric: 'avgRepTurnLength', deviationPct: -50 }), 'الصمت'],
      [pattern({ metric: 'openQuestionRatio', deviationPct: 50 }), 'دون إغلاق الحلقة'],
      [pattern({ metric: 'openQuestionRatio', deviationPct: -50 }), 'الردود المغلقة'],
      [pattern({ metric: 'clearStepsPerTurn', deviationPct: 50 }), 'لا يؤتي أثره'],
      [pattern({ metric: 'clearStepsPerTurn', deviationPct: -50 }), 'تتخطى'],
    ]
    for (const [p, snippet] of cases) {
      const [i] = buildMastermindInsights(gravity([p]), [])
      expect(localizeInsight(i, 'ar').alternative).toContain(snippet)
    }
  })

  it('writes an unused-resource insight in Arabic and does not invent an outcome figure', () => {
    const [i] = buildMastermindInsights(null, [unused])
    const ar = localizeInsight(i, 'ar')
    for (const f of [ar.observation, ar.pattern, ar.impact, ar.alternative, ar.experiment.label]) {
      expect(hasArabic(f)).toBe(true)
      expect(hasLatinWord(f)).toBe(false)
    }
    expect(ar.pattern).toContain('80%')
    expect(ar.pattern).toContain('10%')
    expect(ar.impact).not.toMatch(/\d/)
  })

  it('falls back to the English insight when the evidence is incomplete', () => {
    const [i] = buildMastermindInsights(gravity([pattern()]), [])
    const broken = { ...i, evidence: { trigger: i.evidence.trigger, sessionCount: 1 } }
    expect(localizeInsight(broken, 'ar')).toBe(broken)
  })
})
