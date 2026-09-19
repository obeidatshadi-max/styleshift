import type { Observation } from '@/schemas/observation'
import type { CoachingRecommendation } from '@/schemas/coaching'
import type { SessionReport } from '@/schemas/report'
import { SCORED_COMPETENCIES, type ScoredCompetency } from '@/schemas/scoring'

/** A behavior highlighted on the report, with the evidence that backs it. */
export interface ReportHighlight {
  competency: ScoredCompetency
  behavior: string
  points: number
  observation: Observation | null
}

export interface ReportSummary {
  /** The behavior that helped most (highest positive points), or null. */
  strongest: ReportHighlight | null
  /** The behavior that hurt most (most negative points), or null. */
  biggestOpportunity: ReportHighlight | null
  /** Coaching point tied to the biggest opportunity, else the top-priority one. */
  primaryCoaching: CoachingRecommendation | null
}

function findObservation(report: SessionReport, competency: ScoredCompetency, behavior: string, turns: number[]): Observation | null {
  const list = report.observationsByCompetency[competency] ?? []
  return list.find(o => o.behavior === behavior && o.evidence.some(e => turns.includes(e.turnIndex)))
    ?? list.find(o => o.behavior === behavior) ?? null
}

/** Derives the report's headline items from numbers the scoring engine already
 * computed — nothing here is scored or judged again. Ties resolve to the
 * earlier competency in the fixed scoring order, so output is stable. */
export function summarizeReport(report: SessionReport): ReportSummary {
  let strongest: ReportHighlight | null = null
  let worst: ReportHighlight | null = null

  for (const competency of SCORED_COMPETENCIES) {
    for (const c of report.scores.competencies[competency].contributions) {
      const highlight = () => ({ competency, behavior: c.behavior, points: c.points, observation: findObservation(report, competency, c.behavior, c.evidenceTurns) })
      if (c.points > 0 && (!strongest || c.points > strongest.points)) strongest = highlight()
      if (c.points < 0 && (!worst || c.points < worst.points)) worst = highlight()
    }
  }

  const primaryCoaching =
    (worst && report.coaching.find(c => c.behavior === worst!.behavior)) ??
    [...report.coaching].sort((a, b) => a.priority - b.priority)[0] ?? null

  return { strongest, biggestOpportunity: worst, primaryCoaching }
}
