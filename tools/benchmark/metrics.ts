import type { Observation } from '@/schemas/observation'
import type { CoachingRecommendation } from '@/schemas/coaching'
import type { StyleShiftSession } from '@/schemas/session'
import type { BenchFixture } from './fixtures'

/** One model request inside an analyze() or coach() call. */
export interface CallRecord {
  ok: boolean
  status: number | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  stopReason: string | null
  thinkingTokens: number | null
  /** The reply parsed into the expected top-level shape. */
  jsonValid: boolean
  /** Items the model produced, and how many survived grounding. */
  generated: number
  grounded: number
  dropped: number
}

export type FinalStatus = 'ok' | 'invalid' | 'upstream' | 'error'

interface RecordBase {
  model: string
  fixtureId: string
  mix: BenchFixture['mix']
  style: BenchFixture['style']
  difficulty: BenchFixture['difficulty']
  performance: BenchFixture['performance']
  length: BenchFixture['length']
  calls: CallRecord[]
  attempts: number
  firstAttemptValid: boolean
  retryRequired: boolean
  finalStatus: FinalStatus
  errorDetail: string | null
}

export interface AnalystRecord extends RecordBase {
  arm: 'analyst'
  observations: Observation[]
  generated: number
  grounded: number
  dropped: number
  mustTotal: number
  mustFoundStrict: number
  mustFoundBehavior: number
  trapTotal: number
  trapHits: number
  /** Grounded observations whose evidence is only doctor lines. */
  doctorOnlyEvidence: number
}

export interface CoachRecord extends RecordBase {
  arm: 'coach'
  candidates: number
  kept: number
  dropped: number
  coaching: CoachingRecommendation[]
  /** Output language matches what was asked (Arabic for ar, no Arabic for en). */
  languageOk: boolean
  avgFieldChars: number
}

export type BenchRecord = AnalystRecord | CoachRecord

// ───────────────────────────── scoring against the answer key ─────────────────────────────

export function scoreAgainstKey(f: BenchFixture, obs: Observation[]) {
  const hasAt = (behavior: string, turn: number) =>
    obs.some(o => o.behavior === behavior && o.evidence.some(e => e.turnIndex === turn))
  const has = (behavior: string) => obs.some(o => o.behavior === behavior)
  return {
    mustTotal: f.must.length,
    mustFoundStrict: f.must.filter(m => hasAt(m.behavior, m.turn)).length,
    mustFoundBehavior: f.must.filter(m => has(m.behavior)).length,
    trapTotal: f.mustNot.length,
    trapHits: f.mustNot.filter(m => hasAt(m.behavior, m.turn)).length,
  }
}

export function doctorOnlyEvidenceCount(obs: Observation[]): number {
  return obs.filter(o => o.evidence.length > 0 && o.evidence.every(e => e.role === 'doctor')).length
}

// ───────────────────────────── language checks ─────────────────────────────

const ARABIC = /[؀-ۿ]/g
const LATIN = /[A-Za-z]/g

export function arabicRatio(text: string): number {
  const a = text.match(ARABIC)?.length ?? 0
  const l = text.match(LATIN)?.length ?? 0
  return a + l === 0 ? 0 : a / (a + l)
}

export function coachTextFields(c: CoachingRecommendation): string[] {
  return [c.whatHappened, c.whyItMattered, c.whatToDoDifferently, c.betterResponseExample, c.practiceAction]
}

/** Arabic sessions must get mostly-Arabic coaching; English sessions none. */
export function coachLanguageOk(lang: StyleShiftSession['lang'], coaching: CoachingRecommendation[]): boolean {
  if (coaching.length === 0) return false
  const text = coaching.flatMap(coachTextFields).join(' ')
  const r = arabicRatio(text)
  return lang === 'ar' ? r >= 0.5 : r <= 0.05
}

// ───────────────────────────── statistics ─────────────────────────────

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}

/** Wilson score interval for a proportion (95%). */
export function wilson(successes: number, n: number, z = 1.96): { p: number; lo: number; hi: number } | null {
  if (n === 0) return null
  const p = successes / n
  const d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) }
}

/** Small seeded generator so the A/B order and the bootstrap are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Paired bootstrap of the mean difference (candidate minus baseline). */
export function pairedBootstrap(diffs: number[], iters = 4000, seed = 1): { mean: number; lo: number; hi: number } | null {
  if (diffs.length === 0) return null
  const r = rng(seed)
  const means: number[] = []
  for (let i = 0; i < iters; i++) {
    let s = 0
    for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(r() * diffs.length)]
    means.push(s / diffs.length)
  }
  means.sort((a, b) => a - b)
  return { mean: diffs.reduce((a, b) => a + b, 0) / diffs.length, lo: means[Math.floor(iters * 0.025)], hi: means[Math.floor(iters * 0.975)] }
}

// ───────────────────────────── model variants ─────────────────────────────

/** A benchmark "model" is a model id plus optional settings, written
 * `claude-haiku-5-5@effort=low@mt=2`. Everything after the first @ is a setting. */
export function baseModel(spec: string): string {
  return spec.split('@')[0]
}

export interface VariantSettings { model: string; effort: string | null; maxTokensMultiplier: number | null }

export function parseVariant(spec: string): VariantSettings {
  const [model, ...rest] = spec.split('@')
  let effort: string | null = null, mt: number | null = null
  for (const part of rest) {
    const [k, v] = part.split('=')
    if (k === 'effort' && v) effort = v
    else if (k === 'mt' && Number(v) > 0) mt = Number(v)
    else throw new Error(`Unknown variant setting "${part}" in "${spec}" (use effort=low|medium|high or mt=<number>)`)
  }
  return { model, effort, maxTokensMultiplier: mt }
}

// ───────────────────────────── cost ─────────────────────────────

export interface Rate { le100k: number | null; gt100k: number | null }
export interface ModelPricing {
  inputPerMTok: Rate
  outputPerMTok: Rate
  verifiedAt: string | null
  source: string | null
}
export interface PricingFile { version: number; currency: string; models: Record<string, ModelPricing> }

/** Cost of one request. Returns null when a price is missing, so an unverified
 * price can never turn into a made-up cost. The tier is chosen per request by
 * its own input size. */
export function requestCost(p: ModelPricing | undefined, inputTokens: number | null, outputTokens: number | null): number | null {
  if (!p || inputTokens === null || outputTokens === null) return null
  const tier = inputTokens > 100_000 ? 'gt100k' : 'le100k'
  const i = p.inputPerMTok[tier], o = p.outputPerMTok[tier]
  if (i === null || o === null) return null
  return (inputTokens * i + outputTokens * o) / 1_000_000
}

export function recordCost(p: ModelPricing | undefined, r: BenchRecord): number | null {
  let total = 0
  for (const c of r.calls) {
    const x = requestCost(p, c.inputTokens, c.outputTokens)
    if (x === null) return null
    total += x
  }
  return total
}
