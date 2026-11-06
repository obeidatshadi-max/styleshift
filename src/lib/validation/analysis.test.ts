import { describe, it, expect } from 'vitest'
import { analyse, type AnalysisCase, type AnalysisInput, type AnalysisRating, type ClaimVerdict } from './analysis'
import { AI_COMPARABLE_DOMAINS, RUBRIC_DOMAINS, type RubricDomain } from './rubric'

/** A deterministic 1-5 pattern that uses the whole scale, so kappa is defined. */
const pattern = (i: number, d: number) => ((i * 3 + d * 2) % 5) + 1
const scoresFor = (i: number, f: (v: number) => number | null = v => v): AnalysisRating['scores'] =>
  Object.fromEntries(RUBRIC_DOMAINS.map((d, di) => [d, f(pattern(i, di))])) as AnalysisRating['scores']
/** An AI score (0-100) that converts to exactly this rating. */
const aiFor = (rating: number) => (rating - 1) * 20 + 10

function makeCases(n: number, opts: { second?: (v: number) => number | null; ai?: (v: number) => number | null; phase?: AnalysisCase['phase']; rep?: (i: number) => string; version?: 'v1' | 'v2' } = {}): AnalysisCase[] {
  return Array.from({ length: n }, (_, i) => ({
    assignmentId: `a${i}`, repId: opts.rep ? opts.rep(i) : `rep${i}`, scenarioType: 'A', scenarioVersion: opts.version ?? 'v1', phase: opts.phase ?? 'baseline',
    ratings: [
      { raterId: 'r1', unscorable: false, scores: scoresFor(i) },
      { raterId: 'r2', unscorable: false, scores: scoresFor(i, opts.second) },
    ],
    ai: Object.fromEntries(AI_COMPARABLE_DOMAINS.map(d => [d, (() => { const v = pattern(i, RUBRIC_DOMAINS.indexOf(d)); return opts.ai ? opts.ai(v) : aiFor(v) })()])) as AnalysisCase['ai'],
  }))
}
const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({ dataSource: 'pilot', cases: makeCases(40), claims: [], securityGate: 'PASS', criticalIncidents: 0, ...over })
const claim = (i: number, verdict: ClaimVerdict['verdict'], over: Partial<ClaimVerdict> = {}): ClaimVerdict => ({ assignmentId: `a${i % 40}`, claimRef: `c${i}`, certainty: 'stated', verdict, adjudicatorId: 'j1', ...over })

describe('rater agreement', () => {
  it('is 1 when two raters always agree, and is MET with enough sessions', () => {
    const r = analyse(input())
    expect(r.raterAgreement.pooledKappa.estimate).toBeCloseTo(1, 10)
    expect(r.raterAgreement.pooledKappa.n).toBe(40 * 9)
    expect(r.raterAgreement.sessionAverageIcc.icc).toBeCloseTo(1, 10)
    expect(r.indicators.raterAgreement.status).toBe('MET')
  })

  it('is negative when one rater reverses the scale, and is NOT_MET', () => {
    const r = analyse(input({ cases: makeCases(40, { second: v => 6 - v }) }))
    expect(r.raterAgreement.pooledKappa.estimate!).toBeLessThan(0)
    expect(r.indicators.raterAgreement.status).toBe('NOT_MET')
  })

  it('is NOT_ENOUGH_DATA below 30 double-rated sessions, whatever the estimate', () => {
    const r = analyse(input({ cases: makeCases(10) }))
    expect(r.raterAgreement.pooledKappa.estimate).toBeCloseTo(1, 10)
    expect(r.indicators.raterAgreement.status).toBe('NOT_ENOUGH_DATA')
  })

  it('leaves "not observable" out of the pair and counts it, never as a number', () => {
    const cases = makeCases(40, { second: v => (v === 3 ? null : v) })
    const r = analyse(input({ cases }))
    const unobserved = cases.reduce((s, c) => s + RUBRIC_DOMAINS.filter(d => c.ratings[1].scores[d] === null).length, 0)
    expect(unobserved).toBeGreaterThan(0)
    expect(r.raterAgreement.pooledKappa.excluded).toBe(unobserved)
    expect(r.raterAgreement.pooledKappa.n).toBe(40 * 9 - unobserved)
    expect(r.raterAgreement.pooledKappa.estimate).toBeCloseTo(1, 10)
  })

  it('an unscorable rating counts as no score, not as agreement', () => {
    const cases = makeCases(40)
    cases[0].ratings[1] = { raterId: 'r2', unscorable: true, scores: {} }
    const r = analyse(input({ cases }))
    expect(r.counts.casesWithTwoRatings).toBe(39)
    expect(r.counts.casesFullyRated).toBe(40)
  })

  it('reports every domain separately', () => {
    const r = analyse(input())
    expect(Object.keys(r.raterAgreement.perDomain).sort()).toEqual([...RUBRIC_DOMAINS].sort())
  })

  it('gives the same numbers every time (fixed bootstrap seed)', () => {
    const noisy = makeCases(40, { second: v => Math.max(1, Math.min(5, v + (v % 2 ? 1 : 0))) })
    expect(analyse(input({ cases: noisy }))).toEqual(analyse(input({ cases: noisy })))
  })
})

describe('AI-human agreement', () => {
  it('is 1 when the AI converts to exactly the human ratings, only on the domains the AI covers', () => {
    const r = analyse(input())
    expect(r.aiHumanAgreement.pooledKappa.estimate).toBeCloseTo(1, 10)
    expect(Object.keys(r.aiHumanAgreement.perDomain).sort()).toEqual([...AI_COMPARABLE_DOMAINS].sort())
    expect(r.aiHumanAgreement.perDomain.composure).toBeUndefined()
    expect(r.aiHumanAgreement.perDomain.state_adaptation).toBeUndefined()
    expect(r.indicators.aiHumanAgreement.status).toBe('MET')
    const first = r.aiHumanAgreement.perDomain.opening!
    expect(first.error.mae).toBe(0)
    expect(first.error.shareLarge).toBe(0)
    expect(r.aiHumanAgreement.byRaterSlot).toEqual([expect.closeTo(1, 10), expect.closeTo(1, 10)])
  })

  it('is NOT_MET when the AI is inverted, and reports the size of the errors', () => {
    const r = analyse(input({ cases: makeCases(40, { ai: v => aiFor(6 - v) }) }))
    expect(r.aiHumanAgreement.pooledKappa.estimate!).toBeLessThan(0)
    expect(r.indicators.aiHumanAgreement.status).toBe('NOT_MET')
    expect(r.aiHumanAgreement.perDomain.opening!.error.mae!).toBeGreaterThan(1)
  })

  it('leaves a missing AI score out and counts it, never as 0', () => {
    const r = analyse(input({ cases: makeCases(40, { ai: () => null }) }))
    expect(r.aiHumanAgreement.pooledKappa.estimate).toBeNull()
    expect(r.aiHumanAgreement.pooledKappa.n).toBe(0)
    expect(r.aiHumanAgreement.pooledKappa.excluded).toBeGreaterThan(0)
    expect(r.indicators.aiHumanAgreement.status).toBe('NOT_ENOUGH_DATA')
  })

  it('reports the cut-point sensitivity checks', () => {
    const d = analyse(input()).aiHumanAgreement.perDomain.opening!
    expect(d.kappaShiftMinus5).not.toBeNull()
    expect(d.kappaShiftPlus5).not.toBeNull()
    expect(d.kappaShiftMinus5!).toBeLessThanOrEqual(1)
  })
})

describe('AI claims', () => {
  const claims = (total: number, unsupported: number) => Array.from({ length: total }, (_, i) => claim(i, i < unsupported ? 'unsupported' : 'supported'))

  it('1 unsupported in 100 is MET; 3 in 100 is NOT_MET; under 100 claims is NOT_ENOUGH_DATA', () => {
    expect(analyse(input({ claims: claims(100, 1) })).indicators.unsupportedClaims.status).toBe('MET')
    expect(analyse(input({ claims: claims(100, 3) })).indicators.unsupportedClaims.status).toBe('NOT_MET')
    expect(analyse(input({ claims: claims(99, 0) })).indicators.unsupportedClaims.status).toBe('NOT_ENOUGH_DATA')
  })

  it('resolves several adjudicators by majority, and a tie takes the more adverse verdict', () => {
    const rows: ClaimVerdict[] = [
      claim(0, 'supported', { adjudicatorId: 'j1' }), claim(0, 'supported', { adjudicatorId: 'j2' }), claim(0, 'unsupported', { adjudicatorId: 'j3' }),
      claim(1, 'supported', { adjudicatorId: 'j1' }), claim(1, 'unsupported', { adjudicatorId: 'j2' }),
      claim(2, 'partly_supported', { adjudicatorId: 'j1' }),
    ]
    const r = analyse(input({ claims: rows })).claims
    expect(r.adjudicated).toBe(3)
    expect(r.unsupported).toBe(1)           // claim 1 (a tie), not claim 0 (majority supported)
    expect(r.adjudicatorDisagreements).toBe(2)
  })

  it('reports the unsupported rate for each certainty word separately', () => {
    const rows = [claim(0, 'unsupported', { certainty: 'stated' }), claim(1, 'supported', { certainty: 'stated' }), claim(2, 'supported', { certainty: 'inferred' }), claim(3, 'supported', { certainty: null })]
    const c = analyse(input({ claims: rows })).claims.byCertainty
    expect(c.stated).toMatchObject({ n: 2, unsupported: 1 })
    expect(c.inferred).toMatchObject({ n: 1, unsupported: 0 })
    expect(c.not_established.n).toBe(0)
    expect(c.unlabelled.n).toBe(1)
  })
})

describe('coaching change', () => {
  const rated = (rep: string, phase: AnalysisCase['phase'], version: 'v1' | 'v2', level: number, id: string): AnalysisCase => ({
    assignmentId: id, repId: rep, scenarioType: 'A', scenarioVersion: version, phase, ai: {},
    ratings: [{ raterId: 'r1', unscorable: false, scores: Object.fromEntries(RUBRIC_DOMAINS.map(d => [d, level])) as AnalysisRating['scores'] }],
  })

  it('measures the follow-up on the alternate scenario separately from a repeat of the same one', () => {
    const cases = [
      rated('p', 'baseline', 'v1', 2, 'b1'), rated('p', 'followup', 'v2', 4, 'f1'),   // transfer: +2
      rated('q', 'baseline', 'v1', 3, 'b2'), rated('q', 'followup', 'v1', 4, 'f2'),   // repeat: +1
    ]
    const c = analyse(input({ cases })).coachingChange
    expect(c.alternateScenario).toMatchObject({ n: 1, meanDifference: 2 })
    expect(c.sameScenario).toEqual({ n: 1, meanDifference: 1 })
    expect(c.repsWithBaselineAndFollowup).toBe(2)
    expect(c.note).toMatch(/not "caused"/)
  })

  it('says change is not assessable by target domain, and never calls overall change a MET indicator', () => {
    const r = analyse(input({ cases: [rated('p', 'baseline', 'v1', 2, 'b1'), rated('p', 'followup', 'v2', 5, 'f1')] }))
    expect(r.indicators.targetedBehaviorChange.status).toBe('NOT_ENOUGH_DATA')
    expect(r.indicators.targetedBehaviorChange.detail).toMatch(/target/)
  })
})

describe('recommendation', () => {
  it('synthetic and staging data are labelled and never produce a recommendation', () => {
    for (const dataSource of ['synthetic', 'staging'] as const) {
      const r = analyse(input({ dataSource }))
      expect(r.recommendation).toBe('NOT_PILOT_DATA')
      expect(r.label).toMatch(/not pilot evidence/)
    }
    expect(analyse(input()).label).toBe('Pilot data')
  })

  it('is INSUFFICIENT_EVIDENCE when the minimum data is not there', () => {
    const r = analyse(input({ cases: makeCases(5) }))
    expect(r.recommendation).toBe('INSUFFICIENT_EVIDENCE')
    expect(r.minimums.doubleRatedSessions).toEqual({ have: 5, need: 30, reached: false })
    expect(r.minimums.arabicUtterances).toEqual({ have: null, need: 150, reached: false })
  })

  it('stays INSUFFICIENT_EVIDENCE while an indicator is unmeasured, even with excellent numbers elsewhere', () => {
    const cases = [
      ...makeCases(40, { phase: 'baseline', rep: i => `rep${i % 12}` }).map((c, i) => ({ ...c, assignmentId: `b${i}` })),
      ...makeCases(40, { phase: 'followup', version: 'v2', rep: i => `rep${i % 12}` }).map((c, i) => ({ ...c, assignmentId: `f${i}` })),
    ]
    const claims = Array.from({ length: 120 }, (_, i) => claim(i, 'supported'))
    const r = analyse(input({ cases, claims, arabic: { utterances: 200, negationUtterances: 60, negationPreserved: 60 } }))
    expect(r.indicators.raterAgreement.status).toBe('MET')
    expect(r.indicators.unsupportedClaims.status).toBe('MET')
    expect(r.indicators.negationPreserved.status).toBe('MET')
    expect(Object.values(r.minimums).every(m => m.reached)).toBe(true)
    expect(r.indicators.evidenceValidity.status).toBe('NOT_ENOUGH_DATA')
    expect(r.recommendation).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('is NO_GO for a critical incident, a failed security gate, or an indicator that is NOT_MET', () => {
    expect(analyse(input({ criticalIncidents: 1 })).recommendation).toBe('NO_GO')
    expect(analyse(input({ securityGate: 'FAIL' })).recommendation).toBe('NO_GO')
    expect(analyse(input({ cases: makeCases(40, { second: v => 6 - v }) })).recommendation).toBe('NO_GO')
  })

  it('records the versions it was computed under', () => {
    const r = analyse(input())
    expect(r.methodologyVersion).toBe('mm-1.0.0')
    expect(r.rubricVersion).toBe('hrr-1.0.0')
  })
})

describe('input is never changed', () => {
  it('does not mutate the cases or claims it is given', () => {
    const i = input({ claims: [claim(0, 'supported')] })
    const before = JSON.stringify(i)
    analyse(i)
    expect(JSON.stringify(i)).toBe(before)
  })
})

// A type-level check that the helper covers every domain.
const _domains: RubricDomain[] = [...RUBRIC_DOMAINS]
void _domains
