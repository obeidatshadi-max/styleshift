import type { Competency, EvidenceRef } from '@/schemas/observation'

/** 'improve' = a behavior that hurt the conversation. 'build_on' = a strength
 * worth extending, used only when the session had nothing to improve. */
export type CoachingKind = 'improve' | 'build_on'

/** One coaching point. `competency`, `behavior`, `evidence` and `priority` are
 * set by the app from grounded observations; the model only writes the
 * five text fields. No field holds a score. */
export interface CoachingRecommendation {
  id: string
  /** 1 = most important. Assigned by the app, not the model. */
  priority: number
  kind: CoachingKind
  competency: Competency
  /** Behavior key from the scoring catalog. */
  behavior: string
  /** 1. What happened. */
  whatHappened: string
  /** 2. Transcript evidence — verbatim, copied from the observation. */
  evidence: EvidenceRef[]
  /** 3. Why it mattered, tied to the doctor's reaction. */
  whyItMattered: string
  /** 4. What the representative should do differently. */
  whatToDoDifferently: string
  /** 5. Example of a better response, in the rep's own voice. */
  betterResponseExample: string
  /** 6. One concrete practice action for the next session. */
  practiceAction: string
  /** Learning objective this point serves, if any. */
  objectiveId: string | null
}
