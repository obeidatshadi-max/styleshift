import { DIFFICULTY_LEVELS, type Difficulty } from '@/lib/voice-partner-core'
import { SCORED_COMPETENCIES, type ScoredCompetency } from '@/schemas/scoring'
import rawConfig from './scoring.config.json'

export interface BehaviorRule {
  /** Signed points a fully-confident observation of this behavior applies. */
  points: number
  /** 'user' = value you specified; 'proposed' = default added to fill the catalog. */
  source: 'user' | 'proposed'
  description: string
}

export interface CompetencyRule {
  /** Share of the overall score (relative; normalized over scored competencies). */
  weight: number
  /** Fixed catalog of behaviors the analyst may report for this competency. */
  behaviors: Record<string, BehaviorRule>
}

export interface ScoringConfig {
  version: string
  /** Score a competency starts from before behaviors move it. */
  baseScore: number
  minScore: number
  maxScore: number
  /** Global multiplier on every behavior's points (rescale without editing each). */
  pointScale: number
  /** Observations below this confidence are ignored. */
  minConfidence: number
  /** Fewer usable observations than this -> score is null, not guessed. */
  minObservations: number
  /** Each repeat of the SAME behavior counts this much less (0-1), so one
   * trivial behavior repeated cannot inflate or crater a score. */
  repeatDecay: number
  /** Scales positive points only: harder personas earn more for the same behavior. */
  difficultyMultiplier: Record<Difficulty, number>
  competencies: Record<ScoredCompetency, CompetencyRule>
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validates a raw config object. Throws with a precise message so a bad edit
 * to scoring.config.json fails loudly instead of silently mis-scoring. */
export function parseScoringConfig(raw: unknown): ScoringConfig {
  const fail = (msg: string): never => { throw new Error(`Invalid scoring config: ${msg}`) }
  if (!raw || typeof raw !== 'object') return fail('not an object')
  const c = raw as Record<string, unknown>

  if (typeof c.version !== 'string' || !c.version) fail('version must be a non-empty string')
  for (const k of ['baseScore', 'minScore', 'maxScore', 'pointScale', 'minConfidence', 'minObservations', 'repeatDecay'] as const) {
    if (!isNum(c[k])) fail(`${k} must be a finite number`)
  }
  const minScore = c.minScore as number, maxScore = c.maxScore as number, baseScore = c.baseScore as number
  if (minScore >= maxScore) fail('minScore must be below maxScore')
  if (baseScore < minScore || baseScore > maxScore) fail('baseScore must be within minScore..maxScore')
  if ((c.pointScale as number) <= 0) fail('pointScale must be > 0')
  if ((c.minConfidence as number) < 0 || (c.minConfidence as number) > 1) fail('minConfidence must be 0-1')
  if ((c.minObservations as number) < 1) fail('minObservations must be at least 1')
  if ((c.repeatDecay as number) <= 0 || (c.repeatDecay as number) > 1) fail('repeatDecay must be >0 and <=1')

  const dm = c.difficultyMultiplier as Record<string, unknown> | undefined
  const difficultyMultiplier = {} as Record<Difficulty, number>
  for (const d of DIFFICULTY_LEVELS) {
    const v = dm?.[d]
    if (!isNum(v) || v <= 0) fail(`difficultyMultiplier.${d} must be a positive number`)
    difficultyMultiplier[d] = v as number
  }

  const comps = c.competencies as Record<string, unknown> | undefined
  const competencies = {} as Record<ScoredCompetency, CompetencyRule>
  const seenBehaviors = new Set<string>()
  for (const name of SCORED_COMPETENCIES) {
    const r = comps?.[name] as Record<string, unknown> | undefined
    if (!r) { fail(`missing rule for competency "${name}"`); continue }
    if (!isNum(r.weight) || r.weight < 0) fail(`${name}.weight must be a number >= 0`)
    const bs = r.behaviors as Record<string, unknown> | undefined
    if (!bs || typeof bs !== 'object' || Object.keys(bs).length === 0) fail(`${name}.behaviors must list at least one behavior`)
    const behaviors: Record<string, BehaviorRule> = {}
    for (const [key, val] of Object.entries(bs as Record<string, unknown>)) {
      const b = val as Record<string, unknown>
      if (!/^[a-z][a-z0-9_]*$/.test(key)) fail(`${name}.${key}: behavior key must be snake_case`)
      // A key must map to exactly one competency, or observations would be ambiguous.
      if (seenBehaviors.has(key)) fail(`behavior "${key}" is defined under more than one competency`)
      seenBehaviors.add(key)
      if (!b || !isNum(b.points) || b.points === 0) fail(`${name}.${key}.points must be a non-zero number`)
      if (b.source !== 'user' && b.source !== 'proposed') fail(`${name}.${key}.source must be "user" or "proposed"`)
      if (typeof b.description !== 'string' || !b.description) fail(`${name}.${key}.description is required`)
      behaviors[key] = { points: b.points as number, source: b.source as 'user' | 'proposed', description: b.description as string }
    }
    competencies[name] = { weight: r.weight as number, behaviors }
  }
  if (!SCORED_COMPETENCIES.some(n => competencies[n].weight > 0)) fail('at least one competency needs weight > 0')

  return {
    version: c.version as string, baseScore, minScore, maxScore, pointScale: c.pointScale as number,
    minConfidence: c.minConfidence as number, minObservations: c.minObservations as number,
    repeatDecay: c.repeatDecay as number, difficultyMultiplier, competencies,
  }
}

/** The shipped config, validated once at import. */
export const defaultScoringConfig: ScoringConfig = parseScoringConfig(rawConfig)

/** behavior key -> its competency and rule, across the whole catalog. */
export function behaviorIndex(cfg: ScoringConfig): Map<string, { competency: ScoredCompetency; rule: BehaviorRule }> {
  const index = new Map<string, { competency: ScoredCompetency; rule: BehaviorRule }>()
  for (const competency of SCORED_COMPETENCIES) {
    for (const [key, rule] of Object.entries(cfg.competencies[competency].behaviors)) index.set(key, { competency, rule })
  }
  return index
}
