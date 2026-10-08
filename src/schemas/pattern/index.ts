import type { StyleKey } from '@/types/game'
import type { Difficulty, ObjectionType } from '@/lib/voice-partner-core'

/**
 * Longitudinal behavior memory, in four layers that must never be collapsed:
 *
 *   BehaviorEvent  (observed)       one grounded behavior in one session
 *   PatternRecord  (recurring)      counts over many events — arithmetic only
 *   Interpretation (inferred)       a hedged reading of a pattern, labelled as inference
 *   Recommendation (coaching)       what to practice next
 *
 * Events and patterns are computed from stored sessions; interpretation and
 * recommendation are produced separately and always point back at the
 * pattern they came from.
 */

export interface EventContext {
  physicianStyle: StyleKey | null
  difficulty: Difficulty
  language: 'en' | 'ar'
  objectionType: ObjectionType | null
  /** Set when the session ran from a saved scenario (Phase 2+). */
  scenarioId: string | null
}

export interface EventEvidence {
  turnIndex: number
  role: 'doctor' | 'rep'
  /** Verbatim transcript text of that turn (trimmed). Never model-authored. */
  text: string
}

export interface BehaviorEvent {
  /** `${sessionId}:${behavior}` — one event per behavior per session. */
  id: string
  sessionId: string
  /** Ontology key from scoring.config.json. */
  behavior: string
  competency: string
  /** Sign of the scoring contribution: 'helped' (+) or 'hurt' (-). */
  effect: 'helped' | 'hurt'
  confidence: number
  occurredAt: string | null
  context: EventContext
  evidence: EventEvidence[]
}

export type TrendDirection = 'improving' | 'worsening' | 'stable' | 'unclear'

export interface PatternRecord {
  behavior: string
  effect: 'helped' | 'hurt'
  /** Sessions where it occurred / sessions considered. */
  sessionsWith: number
  sessionsConsidered: number
  /** Sessions since it last occurred (0 = latest session). */
  recencySessions: number
  /** Mean confidence of the contributing events. */
  confidence: number
  trend: TrendDirection
  /** Where the behavior clusters, only when the cluster is unambiguous. */
  dominantContext: Partial<Pick<EventContext, 'physicianStyle' | 'difficulty' | 'objectionType' | 'language'>>
  eventIds: string[]
}

export type InsightKind = 'recurring_hurt' | 'recurring_strength' | 'context_contrast' | 'resolved_hurt'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

/** What was counted. Numbers and verbatim quotes only; no reading of them. */
export interface InsightObserved {
  /** Sessions where it occurred / sessions considered (recurring and resolved insights). */
  sessionsWith?: number
  sessionsConsidered: number
  behavior?: string
  trend?: TrendDirection
  context?: PatternRecord['dominantContext']
  /** context_contrast: the capability dimension, the context field compared and the two groups. */
  contrast?: {
    dimension: string
    contextKey: 'physicianStyle' | 'objectionType'
    higher: { value: string; positive: number; sessions: number }
    lower: { value: string; positive: number; sessions: number }
  }
  /** Verbatim transcript text of the rep's own turns. Never model-written. */
  evidence: EventEvidence[]
}

export type CaveatCode = 'small_sample' | 'no_cause_known' | 'scenarios_not_random'

/** A hedged reading of what was observed. Always labelled as inference; it explains nothing about why. */
export interface Interpretation {
  code: 'recurring_habit' | 'habit_under_conditions' | 'reliable_strength' | 'varies_by_context' | 'habit_changed'
  certainty: 'inferred'
  caveats: CaveatCode[]
}

export interface InsightRecommendation {
  kind: 'drill' | 'keep_going'
  /** Micro-practice drill id to try. */
  drillId: string | null
  /** The behavior or capability area the practice is about. */
  focus: string | null
  /** Scoring weights are never changed by a recommendation. */
  changesScoringConfig: false
}

/** Observed -> interpretation -> coaching, kept as three separate parts of one insight. */
export interface PatternInsight {
  id: string
  kind: InsightKind
  observed: InsightObserved
  interpretation: Interpretation
  recommendation: InsightRecommendation
  confidence: ConfidenceLevel
}
