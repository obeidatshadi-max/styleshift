/**
 * The statistics the pilot is judged by, exactly as pre-specified in docs/validation/measurement-methodology.md
 * (mm-1.0.0). Pure functions, no I/O. Missing values are excluded and counted, never turned into a number.
 * Thresholds here are the documented design choices; changing one is a new methodology version.
 */

export type Pair = readonly [number | null | undefined, number | null | undefined]

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const completePairs = (pairs: readonly Pair[]): Array<[number, number]> =>
  pairs.filter((p): p is [number, number] => finite(p[0]) && finite(p[1]))

// ───────────────────────────── agreement ─────────────────────────────

export interface KappaResult {
  /** null when it cannot be computed (no complete pairs, or no variation in either rater). */
  kappa: number | null
  n: number
  /** Pairs left out because one side was not observable or missing. Always reported beside kappa. */
  excluded: number
  reason?: 'no_pairs' | 'no_variation'
}

/** Weighted Cohen's kappa for two raters on an ordinal scale. Quadratic weights by default. */
export function weightedKappa(pairs: readonly Pair[], opts: { categories?: number[]; weights?: 'quadratic' | 'linear' } = {}): KappaResult {
  const categories = opts.categories ?? [1, 2, 3, 4, 5]
  const k = categories.length
  const done = completePairs(pairs).filter(([a, b]) => categories.includes(a) && categories.includes(b))
  const excluded = pairs.length - done.length
  const n = done.length
  if (n === 0) return { kappa: null, n, excluded, reason: 'no_pairs' }
  const index = new Map(categories.map((c, i) => [c, i]))
  const O = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  for (const [a, b] of done) O[index.get(a)!][index.get(b)!] += 1
  const rows = O.map(r => r.reduce((s, v) => s + v, 0))
  const cols = Array.from({ length: k }, (_, j) => O.reduce((s, r) => s + r[j], 0))
  const w = (i: number, j: number) => {
    const d = Math.abs(i - j) / (k - 1)
    return opts.weights === 'linear' ? d : d * d
  }
  let observed = 0, expected = 0
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    observed += w(i, j) * O[i][j] / n
    expected += w(i, j) * (rows[i] * cols[j]) / (n * n)
  }
  if (expected === 0) return { kappa: null, n, excluded, reason: 'no_variation' }
  return { kappa: 1 - observed / expected, n, excluded }
}

export interface IccResult { icc: number | null; n: number; k: number; excluded: number }

/**
 * ICC(2,1): two-way random effects, absolute agreement, single rater (Shrout and Fleiss, 1979).
 * Each row is one subject (a session); each column one rater. Rows with any missing value are left out and counted.
 */
export function icc21(rows: ReadonlyArray<ReadonlyArray<number | null | undefined>>): IccResult {
  const k = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const full = rows.filter(r => r.length === k && r.every(finite)) as number[][]
  const n = full.length
  const excluded = rows.length - n
  if (n < 2 || k < 2) return { icc: null, n, k, excluded }
  const grand = full.flat().reduce((s, v) => s + v, 0) / (n * k)
  const rowMeans = full.map(r => r.reduce((s, v) => s + v, 0) / k)
  const colMeans = Array.from({ length: k }, (_, j) => full.reduce((s, r) => s + r[j], 0) / n)
  const ssr = k * rowMeans.reduce((s, m) => s + (m - grand) ** 2, 0)
  const ssc = n * colMeans.reduce((s, m) => s + (m - grand) ** 2, 0)
  const sst = full.flat().reduce((s, v) => s + (v - grand) ** 2, 0)
  const sse = sst - ssr - ssc
  const msr = ssr / (n - 1), msc = ssc / (k - 1), mse = sse / ((n - 1) * (k - 1))
  const denom = msr + (k - 1) * mse + (k * (msc - mse)) / n
  if (denom === 0) return { icc: null, n, k, excluded }
  return { icc: (msr - mse) / denom, n, k, excluded }
}

export interface ErrorResult { mae: number | null; n: number; excluded: number; shareLarge: number | null }

/** Mean absolute error in rubric points, and the share of errors of `largeAt` points or more (default 2). */
export function meanAbsoluteError(pairs: readonly Pair[], largeAt = 2): ErrorResult {
  const done = completePairs(pairs)
  const n = done.length
  if (n === 0) return { mae: null, n, excluded: pairs.length, shareLarge: null }
  const errs = done.map(([a, b]) => Math.abs(a - b))
  return { mae: errs.reduce((s, e) => s + e, 0) / n, n, excluded: pairs.length - n, shareLarge: errs.filter(e => e >= largeAt).length / n }
}

/** Spearman rank correlation (average ranks for ties). Needs no cut points, so it backs the sensitivity check. */
export function spearman(pairs: readonly Pair[]): { rho: number | null; n: number; excluded: number } {
  const done = completePairs(pairs)
  const n = done.length
  const excluded = pairs.length - n
  if (n < 3) return { rho: null, n, excluded }
  const rank = (xs: number[]) => {
    const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
    const out = new Array<number>(xs.length)
    for (let i = 0; i < order.length;) {
      let j = i
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
      const avg = (i + j) / 2 + 1
      for (let t = i; t <= j; t++) out[order[t][1]] = avg
      i = j + 1
    }
    return out
  }
  const ra = rank(done.map(p => p[0])), rb = rank(done.map(p => p[1]))
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2 }
  if (da === 0 || db === 0) return { rho: null, n, excluded }
  return { rho: num / Math.sqrt(da * db), n, excluded }
}

// ───────────────────────────── proportions ─────────────────────────────

const Z95 = 1.959964

/** Wilson score interval for a proportion. */
export function wilson(successes: number, n: number, z = Z95): { p: number | null; lower: number | null; upper: number | null; n: number } {
  if (!Number.isFinite(successes) || !Number.isFinite(n) || n <= 0 || successes < 0 || successes > n) return { p: null, lower: null, upper: null, n: Math.max(0, n || 0) }
  const p = successes / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return { p, lower: Math.max(0, center - half), upper: Math.min(1, center + half), n }
}

// ───────────────────────────── bootstrap ─────────────────────────────

/** Small seeded generator so every reported interval can be reproduced exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BootstrapResult { estimate: number | null; lower: number | null; upper: number | null; resamples: number; usable: number }

/**
 * Percentile bootstrap (2000 resamples, fixed seed by default). Give `clusterOf` to resample whole clusters,
 * for example every rating of one session together, because ratings inside a session are not independent.
 * Replicates where the statistic is undefined are skipped; with under 80% usable replicates no interval is given.
 */
export function bootstrapCI<T>(items: readonly T[], stat: (sample: T[]) => number | null,
  opts: { resamples?: number; seed?: number; alpha?: number; clusterOf?: (item: T) => string } = {}): BootstrapResult {
  const resamples = opts.resamples ?? 2000
  const rand = mulberry32(opts.seed ?? 1)
  const alpha = opts.alpha ?? 0.05
  const estimate = items.length ? stat([...items]) : null
  const clusters = new Map<string, T[]>()
  if (opts.clusterOf) for (const it of items) { const key = opts.clusterOf(it); clusters.set(key, [...(clusters.get(key) ?? []), it]) }
  const keys = [...clusters.keys()]
  const reps: number[] = []
  for (let r = 0; r < resamples && items.length > 0; r++) {
    let sample: T[]
    if (opts.clusterOf) {
      sample = []
      for (let i = 0; i < keys.length; i++) sample.push(...clusters.get(keys[Math.floor(rand() * keys.length)])!)
    } else {
      sample = new Array<T>(items.length)
      for (let i = 0; i < items.length; i++) sample[i] = items[Math.floor(rand() * items.length)]
    }
    const v = stat(sample)
    if (v !== null && Number.isFinite(v)) reps.push(v)
  }
  if (reps.length < resamples * 0.8) return { estimate, lower: null, upper: null, resamples, usable: reps.length }
  reps.sort((a, b) => a - b)
  const at = (q: number) => reps[Math.min(reps.length - 1, Math.max(0, Math.floor(q * reps.length)))]
  return { estimate, lower: at(alpha / 2), upper: at(1 - alpha / 2), resamples, usable: reps.length }
}

// ───────────────────────────── paired change ─────────────────────────────

export interface WilcoxonResult { n: number; wPlus: number | null; p: number | null; method: 'exact' | 'normal' | 'none' }

/**
 * Wilcoxon signed-rank test on paired differences, two-sided. Zeros are dropped. Exact (all 2^n sign patterns,
 * by dynamic programming over doubled ranks so ties are handled) up to 25 non-zero differences; a normal
 * approximation with tie and continuity correction beyond that.
 */
export function wilcoxonSignedRank(diffs: ReadonlyArray<number | null | undefined>): WilcoxonResult {
  const d = diffs.filter(finite).filter(v => v !== 0)
  const n = d.length
  if (n === 0) return { n: 0, wPlus: null, p: null, method: 'none' }
  const abs = d.map(Math.abs)
  const order = abs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const ranks = new Array<number>(n)
  const tieSizes: number[] = []
  for (let i = 0; i < n;) {
    let j = i
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let t = i; t <= j; t++) ranks[order[t][1]] = avg
    tieSizes.push(j - i + 1)
    i = j + 1
  }
  const wPlus = d.reduce((s, v, i) => s + (v > 0 ? ranks[i] : 0), 0)
  const total = ranks.reduce((s, v) => s + v, 0)
  if (n <= 25) {
    const doubled = ranks.map(r => Math.round(r * 2))
    const sum = doubled.reduce((s, v) => s + v, 0)
    let counts = new Array<number>(sum + 1).fill(0)
    counts[0] = 1
    for (const r of doubled) {
      const next = new Array<number>(sum + 1).fill(0)
      for (let s = 0; s <= sum; s++) if (counts[s]) { next[s] += counts[s]; if (s + r <= sum) next[s + r] += counts[s] }
      counts = next
    }
    const w2 = Math.round(wPlus * 2)
    const dev = Math.abs(w2 - sum / 2)
    let extreme = 0
    for (let s = 0; s <= sum; s++) if (Math.abs(s - sum / 2) >= dev - 1e-9) extreme += counts[s]
    return { n, wPlus, p: Math.min(1, extreme / 2 ** n), method: 'exact' }
  }
  const mean = total / 2
  const tieCorr = tieSizes.reduce((s, t) => s + (t ** 3 - t), 0) / 48
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorr
  const z = (Math.abs(wPlus - mean) - 0.5) / Math.sqrt(variance)
  const p = 2 * (1 - normalCdf(z))
  return { n, wPlus, p: Math.min(1, Math.max(0, p)), method: 'normal' }
}

function normalCdf(z: number): number {
  // Abramowitz and Stegun 7.1.26 approximation of the error function.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

// ───────────────────────────── rating conversion and status rules ─────────────────────────────

/** Rubric section 6: AI 0-100 to a 1-5 rating. `shift` moves every cut point (the sensitivity check uses -5 and +5). */
export function aiScoreToRating(score: number | null | undefined, shift = 0): 1 | 2 | 3 | 4 | 5 | null {
  if (!finite(score)) return null
  const clamped = Math.min(100, Math.max(0, score))
  const cuts = [20, 40, 60, 80].map(c => c + shift)
  return (1 + cuts.filter(c => clamped >= c).length) as 1 | 2 | 3 | 4 | 5
}

export type Status = 'MET' | 'MET_UNCERTAIN' | 'NOT_MET' | 'NOT_ENOUGH_DATA'

/** Interval floor for kappa and ICC (methodology section 4). An arbitrary, documented design choice. */
export const KAPPA_LOWER_FLOOR = 0.5
/** Tolerance for proportion targets, in proportion units (5 percentage points). An arbitrary, documented design choice. */
export const PROPORTION_TOLERANCE = 0.05

/** Status for a kappa or ICC target, from its point estimate and lower interval bound. */
export function agreementStatus(a: { estimate: number | null; lower: number | null; n: number }, target: number, minN: number): Status {
  if (a.n < minN || a.estimate === null) return 'NOT_ENOUGH_DATA'
  if (a.estimate < target) return 'NOT_MET'
  return a.lower !== null && a.lower > KAPPA_LOWER_FLOOR ? 'MET' : 'MET_UNCERTAIN'
}

/**
 * Status for a proportion target. `kind: 'min'` means at least the target (higher is better), `'max'` means at most
 * the target. The interval bound that matters is the lower one for 'min' and the upper one for 'max'.
 */
export function proportionStatus(kind: 'min' | 'max', a: { p: number | null; lower: number | null; upper: number | null; n: number }, target: number, minN: number): Status {
  if (a.n < minN || a.p === null || a.lower === null || a.upper === null) return 'NOT_ENOUGH_DATA'
  if (kind === 'min') {
    if (a.p < target) return 'NOT_MET'
    return a.lower >= target - PROPORTION_TOLERANCE ? 'MET' : 'MET_UNCERTAIN'
  }
  if (a.p > target) return 'NOT_MET'
  return a.upper <= target + PROPORTION_TOLERANCE ? 'MET' : 'MET_UNCERTAIN'
}
