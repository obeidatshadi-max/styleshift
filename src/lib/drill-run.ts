import { createEmptySession } from '@/schemas/session/factory'
import type { StyleShiftSession } from '@/schemas/session'
import type { Observation } from '@/schemas/observation'
import type { DrillTemplate } from '@/schemas/drill'
import { defaultScoringConfig } from '@/scoring/config'
import { scoreDrillResponse, type DrillResult } from '@/lib/drill-registry'

export const MAX_DRILL_RESPONSE_CHARS = 1200

/**
 * A drill response is analysed by the SAME Behavior Analyst that reads full
 * simulations: the doctor's line is turn 0, the rep's answer turn 1. Because
 * the analyst only reports grounded observations (verbatim quotes), a drill
 * score is always traceable to words the rep actually wrote.
 */
export function drillSession(t: DrillTemplate, response: string, lang: 'en' | 'ar', repId: string): StyleShiftSession {
  const s = createEmptySession(`drill-${t.id}`, repId)
  const doctorLine = (t.prompt[lang] ?? '').replace(/^The doctor says:\s*/i, '').replace(/^["“]|["”]$/g, '')
  const turn = (turnIndex: number, role: 'doctor' | 'rep', text: string) => ({
    turnIndex, role, text, objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null,
  })
  return {
    ...s, lang, status: 'abandoned',
    socialStyle: { ...s.socialStyle, dominant: t.physicianStyle, primary: t.physicianStyle, source: t.physicianStyle ? 'legacy' : 'unknown' },
    transcript: [turn(0, 'doctor', doctorLine), turn(1, 'rep', response.trim())],
  }
}

/** Behaviors the analyst saw with enough confidence to count (same floor the scorer uses). */
export function observedBehaviors(observations: readonly Observation[]): string[] {
  const floor = defaultScoringConfig.minConfidence
  return [...new Set(observations.filter(o => o.confidence >= floor).map(o => o.behavior))]
}

export interface CriterionFeedback {
  behavior: string
  met: boolean
  required: boolean
  /** Template wording for this outcome, in the rep's language. */
  message: string
  /** The rep's own words that showed the behavior; only for met behaviors. */
  quote: string | null
}

export function buildDrillFeedback(
  t: DrillTemplate, result: DrillResult, observations: readonly Observation[], lang: 'en' | 'ar',
): CriterionFeedback[] {
  return t.criteria.map(c => {
    const met = result.met.includes(c.behavior)
    const text = (met ? c.metFeedback : c.missedFeedback)
    const quote = met ? observations.find(o => o.behavior === c.behavior)?.evidence[0]?.quote ?? null : null
    return { behavior: c.behavior, met, required: c.required, message: text[lang] ?? text.en ?? '', quote }
  })
}

/** Scores an analysed response end to end (pure; the route supplies the observations). */
export function assessDrillResponse(t: DrillTemplate, observations: readonly Observation[], lang: 'en' | 'ar') {
  const result = scoreDrillResponse(t, observedBehaviors(observations))
  return { result, feedback: buildDrillFeedback(t, result, observations, lang) }
}
