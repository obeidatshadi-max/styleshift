import type { Competency, EvidenceRef, Observation } from '@/schemas/observation'
import type { CoachingKind } from '@/schemas/coaching'
import type { StyleShiftSession } from '@/schemas/session'
import { SCORED_COMPETENCIES, type ScoredCompetency } from '@/schemas/scoring'
import { behaviorIndex, defaultScoringConfig, type ScoringConfig } from '@/scoring/config'

/** Tunable selection rules. The app, not the model, decides WHICH points are
 * important, using the already-computed scores and the scoring catalog. */
export const COACH_SELECTION = {
  maxPoints: 3,
  maxPerCompetency: 2,
  /** Behaviors that hurt the conversation outrank equal-sized positives. */
  negativeBoost: 1.5,
  /** Max chars of the doctor's next line shown as reaction context. */
  reactionChars: 300,
} as const

export interface CoachCandidate {
  ref: string
  kind: CoachingKind
  competency: ScoredCompetency
  behavior: string
  behaviorDescription: string
  observation: string
  evidence: EvidenceRef[]
  /** The doctor's line right after the evidence — what the behavior led to. */
  doctorReaction: string | null
  /** Qualitative standing only. Numbers are never shown to the coach model. */
  standing: 'weaker' | 'middle' | 'stronger' | 'unranked'
  importance: number
}

function standings(session: StyleShiftSession): Map<ScoredCompetency, CoachCandidate['standing']> {
  const out = new Map<ScoredCompetency, CoachCandidate['standing']>()
  const scored = SCORED_COMPETENCIES
    .map(c => ({ c, s: session.scores?.competencies[c]?.score ?? null }))
    .filter((x): x is { c: ScoredCompetency; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s)
  for (const [i, x] of scored.entries()) {
    out.set(x.c, scored.length < 3 ? 'unranked' : i < 2 ? 'weaker' : i >= scored.length - 2 ? 'stronger' : 'middle')
  }
  return out
}

function doctorReactionAfter(session: StyleShiftSession, turnIndex: number): string | null {
  const next = session.transcript.find(t => t.turnIndex > turnIndex && t.role === 'doctor')
  return next ? next.text.slice(0, COACH_SELECTION.reactionChars) : null
}

/** Picks the coaching points deterministically from scored observations.
 * - Prefers behaviors that hurt (negative catalog points), ranked by
 *   |points| x confidence x competency weight.
 * - If none hurt, falls back to building on strengths in the weakest scored
 *   competency. Competencies with no score (no evidence) are never coached. */
export function selectCoachingCandidates(
  session: StyleShiftSession, cfg: ScoringConfig = defaultScoringConfig,
): CoachCandidate[] {
  if (!session.scores) return []
  const catalog = behaviorIndex(cfg)
  const standing = standings(session)

  const scoredObs = session.observations
    .map(o => ({ o, entry: catalog.get(o.behavior) }))
    .filter((x): x is { o: Observation; entry: NonNullable<typeof x.entry> } =>
      !!x.entry && x.entry.competency === x.o.competency && x.o.confidence >= cfg.minConfidence &&
      session.scores!.competencies[x.entry.competency].score !== null)
    .map(({ o, entry }) => ({
      o, entry,
      kind: (entry.rule.points < 0 ? 'improve' : 'build_on') as CoachingKind,
      importance: Math.abs(entry.rule.points) * o.confidence * cfg.competencies[entry.competency].weight
        * (entry.rule.points < 0 ? COACH_SELECTION.negativeBoost : 1),
    }))

  let pool = scoredObs.filter(x => x.kind === 'improve')
  if (pool.length === 0) {
    // Nothing hurt: build on the weakest scored competency's strengths.
    const weakest = SCORED_COMPETENCIES
      .map(c => ({ c, s: session.scores!.competencies[c].score }))
      .filter((x): x is { c: ScoredCompetency; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s)[0]?.c
    pool = scoredObs.filter(x => x.entry.competency === weakest)
  }

  const chosen: typeof pool = []
  const perCompetency = new Map<Competency, number>()
  const seenBehaviors = new Set<string>()
  for (const x of [...pool].sort((a, b) => b.importance - a.importance)) {
    if (chosen.length >= COACH_SELECTION.maxPoints) break
    if (seenBehaviors.has(x.o.behavior)) continue
    if ((perCompetency.get(x.o.competency) ?? 0) >= COACH_SELECTION.maxPerCompetency) continue
    seenBehaviors.add(x.o.behavior)
    perCompetency.set(x.o.competency, (perCompetency.get(x.o.competency) ?? 0) + 1)
    chosen.push(x)
  }

  return chosen.map((x, i) => ({
    ref: `c${i + 1}`,
    kind: x.kind,
    competency: x.entry.competency,
    behavior: x.o.behavior,
    behaviorDescription: x.entry.rule.description,
    observation: x.o.observation,
    evidence: x.o.evidence,
    doctorReaction: doctorReactionAfter(session, Math.min(...x.o.evidence.map(e => e.turnIndex))),
    standing: standing.get(x.entry.competency) ?? 'unranked',
    importance: Math.round(x.importance * 100) / 100,
  }))
}
