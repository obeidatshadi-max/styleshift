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

export interface Interpretation {
  patternKey: string
  /** Always hedged, e.g. "tends to"; never a trait claim. */
  text: string
  certainty: 'inferred'
  caveats: string[]
}

export interface Recommendation {
  patternKey: string
  practice: string
  /** Scoring weights are never changed by a recommendation. */
  changesScoringConfig: false
}
