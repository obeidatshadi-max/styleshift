import type { Competency, ObservationDirection } from '@/schemas/observation'

/** Competencies the app turns into a number. The Behavior Analyst also emits
 * 'communication_clarity'; it has no scoring rules yet (add a competency block
 * to scoring.config.json and list it here to enable it). */
export const SCORED_COMPETENCIES = [
  'questioning',
  'active_listening',
  'discovery',
  'adaptation',
  'objection_handling',
  'value_communication',
  'closing',
] as const satisfies readonly Competency[]
export type ScoredCompetency = typeof SCORED_COMPETENCIES[number]

/** One observation's effect on a competency score — for explainability. */
export interface ScoreContribution {
  /** Behavior key from the scoring catalog. */
  behavior: string
  direction: ObservationDirection
  confidence: number
  /** Signed points after confidence, repeat-decay, scale and difficulty. */
  points: number
  evidenceTurns: number[]
}

export interface CompetencyScore {
  /** 0-100, or null when there was not enough evidence — never fabricated. */
  score: number | null
  reason: 'scored' | 'insufficient_evidence'
  observationsUsed: number
  contributions: ScoreContribution[]
}

/** Computed by the app from analyst observations + config. The model never
 * sets any number here. */
export interface SessionScore {
  competencies: Record<ScoredCompetency, CompetencyScore>
  /** Weighted mean of the scored competencies; null when none were scored. */
  overall: number | null
  /** scored competencies / configured competencies, 0-1. */
  coverage: number
  configVersion: string
  scoredAt: string
}
