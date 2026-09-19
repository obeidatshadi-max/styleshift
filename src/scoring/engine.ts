import type { Observation } from '@/schemas/observation'
import {
  SCORED_COMPETENCIES, type CompetencyScore, type ScoreContribution, type ScoredCompetency, type SessionScore,
} from '@/schemas/scoring'
import type { Difficulty } from '@/lib/voice-partner-core'
import { defaultScoringConfig, type ScoringConfig } from './config'

const round = (n: number) => Math.round(n)

function scoreCompetency(
  name: ScoredCompetency, observations: Observation[], difficulty: Difficulty, cfg: ScoringConfig,
): CompetencyScore {
  const { behaviors } = cfg.competencies[name]
  // Only observations whose behavior is a catalog key for THIS competency count.
  const usable = observations.filter(o =>
    o.competency === name && o.behavior in behaviors && o.confidence >= cfg.minConfidence)

  if (usable.length < cfg.minObservations) {
    return { score: null, reason: 'insufficient_evidence', observationsUsed: usable.length, contributions: [] }
  }

  // Strongest first, so repeat-decay trims the weakest repeats of a behavior.
  const seen = new Map<string, number>()
  const contributions: ScoreContribution[] = []
  let delta = 0

  for (const o of [...usable].sort((a, b) => b.confidence - a.confidence)) {
    const rule = behaviors[o.behavior]
    const repeats = seen.get(o.behavior) ?? 0
    seen.set(o.behavior, repeats + 1)

    const difficulty_ = rule.points > 0 ? cfg.difficultyMultiplier[difficulty] : 1
    const points = rule.points * cfg.pointScale * difficulty_ * o.confidence * Math.pow(cfg.repeatDecay, repeats)
    delta += points
    contributions.push({
      behavior: o.behavior,
      direction: rule.points > 0 ? 'positive' : 'negative',
      confidence: o.confidence,
      points: Math.round(points * 100) / 100,
      evidenceTurns: o.evidence.map(e => e.turnIndex),
    })
  }

  const score = round(Math.max(cfg.minScore, Math.min(cfg.maxScore, cfg.baseScore + delta)))
  return { score, reason: 'scored', observationsUsed: usable.length, contributions }
}

/** Pure and deterministic: same observations + difficulty + config always give
 * the same score. The model only names which catalog behavior occurred (and
 * how confident it is); every point value and every final number comes from
 * the config. */
export function scoreSession(
  observations: Observation[],
  difficulty: Difficulty,
  cfg: ScoringConfig = defaultScoringConfig,
  now: Date = new Date(),
): SessionScore {
  const competencies = {} as Record<ScoredCompetency, CompetencyScore>
  let weighted = 0, weightSum = 0, scored = 0

  for (const name of SCORED_COMPETENCIES) {
    const result = scoreCompetency(name, observations, difficulty, cfg)
    competencies[name] = result
    if (result.score !== null) {
      const w = cfg.competencies[name].weight
      weighted += result.score * w
      weightSum += w
      scored++
    }
  }

  return {
    competencies,
    overall: weightSum > 0 ? round(weighted / weightSum) : null,
    coverage: Math.round((scored / SCORED_COMPETENCIES.length) * 100) / 100,
    configVersion: cfg.version,
    scoredAt: now.toISOString(),
  }
}
