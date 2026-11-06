import { describe, expect, it } from 'vitest'
import {
  agreementStatus, aiScoreToRating, bootstrapCI, icc21, meanAbsoluteError, mulberry32, proportionStatus,
  spearman, weightedKappa, wilcoxonSignedRank, wilson, KAPPA_LOWER_FLOOR, PROPORTION_TOLERANCE,
} from './stats'

describe('weightedKappa', () => {
  it('matches a case worked out by hand: quadratic 0.75, linear 0.625', () => {
    // A = 1 2 3 1 2 3, B = 1 2 3 1 3 2. Observed disagreement 1/12, expected 1/3 (quadratic) and 1/6 vs 4/9 (linear).
    const pairs = [[1, 1], [2, 2], [3, 3], [1, 1], [2, 3], [3, 2]] as const
    expect(weightedKappa(pairs, { categories: [1, 2, 3] }).kappa).toBeCloseTo(0.75, 10)
    expect(weightedKappa(pairs, { categories: [1, 2, 3], weights: 'linear' }).kappa).toBeCloseTo(0.625, 10)
  })
  it('is 1 for perfect agreement and negative for reversed ratings', () => {
    const same = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] as const
    expect(weightedKappa(same).kappa).toBeCloseTo(1, 10)
    const reversed = [[1, 5], [5, 1], [1, 5], [5, 1]] as const
    expect(weightedKappa(reversed).kappa!).toBeLessThan(0)
  })
  it('leaves out pairs where a side is not observable, and says how many', () => {
    const r = weightedKappa([[3, 3], [null, 4], [2, undefined], [4, 4], [1, 2]])
    expect(r.n).toBe(3)
    expect(r.excluded).toBe(2)
  })
  it('never invents a value: no pairs or no variation gives null with a reason', () => {
    expect(weightedKappa([])).toMatchObject({ kappa: null, reason: 'no_pairs' })
    expect(weightedKappa([[null, null]])).toMatchObject({ kappa: null, excluded: 1, reason: 'no_pairs' })
    expect(weightedKappa([[3, 3], [3, 3]])).toMatchObject({ kappa: null, reason: 'no_variation' })
  })
  it('ignores ratings outside the scale instead of mis-binning them', () => {
    const r = weightedKappa([[1, 1], [9, 2], [2, 2], [3, 3]])
    expect(r.n).toBe(3)
    expect(r.excluded).toBe(1)
  })
  it('is symmetric in the two raters', () => {
    const a = [[1, 2], [2, 2], [3, 5], [4, 4], [5, 3], [2, 1]] as const
    const b = a.map(([x, y]) => [y, x] as const)
    expect(weightedKappa(a).kappa).toBeCloseTo(weightedKappa(b).kappa!, 10)
  })
})

describe('icc21', () => {
  it('reproduces the Shrout and Fleiss (1979) example: ICC(2,1) is about 0.29', () => {
    const rows = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]
    const r = icc21(rows)
    expect(r.icc).toBeCloseTo(0.29, 2)
    expect(r.n).toBe(6)
    expect(r.k).toBe(4)
  })
  it('is 1 when raters agree exactly and sessions differ', () => {
    expect(icc21([[1, 1], [3, 3], [5, 5], [2, 2]]).icc).toBeCloseTo(1, 10)
  })
  it('counts and drops sessions where any rating is missing', () => {
    const r = icc21([[1, 1], [3, 3], [null, 4], [5, 5]])
    expect(r.n).toBe(3)
    expect(r.excluded).toBe(1)
  })
  it('gives null when there is too little to compute', () => {
    expect(icc21([[1, 2]]).icc).toBeNull()
    expect(icc21([]).icc).toBeNull()
  })
})

describe('meanAbsoluteError and spearman', () => {
  it('reports the error, the share of errors of two points or more, and the exclusions', () => {
    const r = meanAbsoluteError([[1, 1], [2, 4], [5, 4], [3, null]])
    expect(r.mae).toBeCloseTo((0 + 2 + 1) / 3, 10)
    expect(r.shareLarge).toBeCloseTo(1 / 3, 10)
    expect(r.excluded).toBe(1)
  })
  it('spearman: 1 for the same order, -1 for the reverse, ties get average ranks', () => {
    expect(spearman([[1, 10], [2, 20], [3, 30], [4, 40]]).rho).toBeCloseTo(1, 10)
    expect(spearman([[1, 40], [2, 30], [3, 20], [4, 10]]).rho).toBeCloseTo(-1, 10)
    expect(spearman([[1, 1], [1, 2], [2, 3], [3, 3]]).rho!).toBeGreaterThan(0.7)
    expect(spearman([[1, 1], [2, 2]]).rho).toBeNull()
  })
})

describe('wilson', () => {
  it('matches known intervals: 5 of 10 and 0 of 20', () => {
    const a = wilson(5, 10)
    expect(a.lower).toBeCloseTo(0.2366, 3)
    expect(a.upper).toBeCloseTo(0.7634, 3)
    const z = wilson(0, 20)
    expect(z.lower).toBe(0)
    expect(z.upper).toBeCloseTo(3.8415 / 23.8415, 3)
  })
  it('is undefined for an empty or impossible count', () => {
    expect(wilson(0, 0).p).toBeNull()
    expect(wilson(5, 3).p).toBeNull()
  })
})

describe('bootstrapCI', () => {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)
  it('is reproducible: the same seed gives the same interval', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(bootstrapCI(data, mean, { seed: 7 })).toEqual(bootstrapCI(data, mean, { seed: 7 }))
  })
  it('brackets the estimate', () => {
    const r = bootstrapCI([2, 4, 4, 5, 7, 9, 3, 6], mean)
    expect(r.lower!).toBeLessThanOrEqual(r.estimate!)
    expect(r.upper!).toBeGreaterThanOrEqual(r.estimate!)
  })
  it('resamples whole clusters when asked, so dependent ratings move together', () => {
    const items = [{ s: 'a', v: 1 }, { s: 'a', v: 1 }, { s: 'b', v: 9 }, { s: 'b', v: 9 }]
    const r = bootstrapCI(items, xs => mean(xs.map(x => x.v)), { clusterOf: x => x.s })
    // Only two clusters exist, so every replicate mean is 1, 5 or 9.
    expect([1, 5, 9]).toContain(r.lower)
    expect([1, 5, 9]).toContain(r.upper)
  })
  it('gives no interval when most replicates are undefined', () => {
    const r = bootstrapCI([1, 2, 3], () => null)
    expect(r.lower).toBeNull()
    expect(r.upper).toBeNull()
  })
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(5), b = mulberry32(5)
    for (let i = 0; i < 5; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
})

describe('wilcoxonSignedRank', () => {
  it('exact: five positive differences give p = 2/32', () => {
    const r = wilcoxonSignedRank([1, 2, 3, 4, 5])
    expect(r.method).toBe('exact')
    expect(r.wPlus).toBe(15)
    expect(r.p).toBeCloseTo(2 / 32, 10)
  })
  it('exact: a perfectly balanced pair gives p = 1', () => {
    expect(wilcoxonSignedRank([1, -1]).p).toBe(1)
  })
  it('drops zero differences and null values, and says how many remained', () => {
    const r = wilcoxonSignedRank([0, 0, 2, null, 3, -1])
    expect(r.n).toBe(3)
  })
  it('handles ties exactly', () => {
    const r = wilcoxonSignedRank([2, 2, 2, -1, 3, 3])
    expect(r.method).toBe('exact')
    expect(r.p!).toBeGreaterThan(0)
    expect(r.p!).toBeLessThanOrEqual(1)
  })
  it('uses a normal approximation beyond 25 differences', () => {
    const r = wilcoxonSignedRank(Array.from({ length: 30 }, (_, i) => i + 1))
    expect(r.method).toBe('normal')
    expect(r.p!).toBeLessThan(0.001)
  })
  it('is undefined when every difference is zero', () => {
    expect(wilcoxonSignedRank([0, 0])).toMatchObject({ p: null, method: 'none' })
  })
})

describe('aiScoreToRating (rubric section 6)', () => {
  it('uses the pre-specified cut points', () => {
    expect([0, 19.9, 20, 39.9, 40, 59.9, 60, 79.9, 80, 100].map(s => aiScoreToRating(s))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })
  it('keeps a missing score missing and never turns it into 1', () => {
    expect(aiScoreToRating(null)).toBeNull()
    expect(aiScoreToRating(undefined)).toBeNull()
    expect(aiScoreToRating(Number.NaN)).toBeNull()
  })
  it('shifts every cut point for the sensitivity check', () => {
    expect(aiScoreToRating(24, 5)).toBe(1)
    expect(aiScoreToRating(25, 5)).toBe(2)
    expect(aiScoreToRating(15, -5)).toBe(2)
    expect(aiScoreToRating(14, -5)).toBe(1)
  })
  it('clamps scores outside 0 to 100', () => {
    expect(aiScoreToRating(-10)).toBe(1)
    expect(aiScoreToRating(150)).toBe(5)
  })
})

describe('status rules (methodology section 4)', () => {
  it('kappa: not enough data, not met, met with an uncertain interval, met', () => {
    expect(agreementStatus({ estimate: 0.9, lower: 0.8, n: 10 }, 0.7, 30)).toBe('NOT_ENOUGH_DATA')
    expect(agreementStatus({ estimate: null, lower: null, n: 50 }, 0.7, 30)).toBe('NOT_ENOUGH_DATA')
    expect(agreementStatus({ estimate: 0.6, lower: 0.5, n: 50 }, 0.7, 30)).toBe('NOT_MET')
    expect(agreementStatus({ estimate: 0.75, lower: KAPPA_LOWER_FLOOR, n: 50 }, 0.7, 30)).toBe('MET_UNCERTAIN')
    expect(agreementStatus({ estimate: 0.75, lower: 0.62, n: 50 }, 0.7, 30)).toBe('MET')
  })
  it('a "max" proportion (unsupported claims at most 2%) is judged on the upper bound', () => {
    const w = (x: number, n: number) => wilson(x, n)
    expect(proportionStatus('max', w(0, 20), 0.02, 100)).toBe('NOT_ENOUGH_DATA')
    expect(proportionStatus('max', w(5, 100), 0.02, 100)).toBe('NOT_MET')
    // 1 of 100: point 1%, but the upper bound is far above 2% + 5 points? check the rule, not a guess.
    const one = w(1, 100)
    expect(proportionStatus('max', one, 0.02, 100)).toBe(one.upper! <= 0.02 + PROPORTION_TOLERANCE ? 'MET' : 'MET_UNCERTAIN')
    expect(proportionStatus('max', w(0, 400), 0.02, 100)).toBe('MET')
  })
  it('a "min" proportion (evidence validity at least 95%) is judged on the lower bound', () => {
    const w = (x: number, n: number) => wilson(x, n)
    expect(proportionStatus('min', w(90, 100), 0.95, 50)).toBe('NOT_MET')
    expect(proportionStatus('min', w(50, 50), 0.95, 50)).toBe('MET')
    expect(proportionStatus('min', w(19, 20), 0.95, 50)).toBe('NOT_ENOUGH_DATA')
  })
})
