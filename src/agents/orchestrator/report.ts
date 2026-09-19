import { SPECIALTIES } from '@/lib/game-data'
import type { Competency, Observation } from '@/schemas/observation'
import type { CoachingStatus, SessionReport } from '@/schemas/report'
import type { StyleShiftSession } from '@/schemas/session'

/** Pure assembly of the final report from a finished session. It only
 * arranges what the specialists already produced — no analysis, no scoring,
 * no text generation. Internal physician state and the hidden concern are
 * deliberately left out. */
export function assembleReport(
  session: StyleShiftSession, coachingStatus: CoachingStatus, warnings: string[], now: Date,
): SessionReport {
  if (!session.scores) throw new Error('assembleReport: session has no scores')

  const observationsByCompetency: Partial<Record<Competency, Observation[]>> = {}
  for (const o of session.observations) (observationsByCompetency[o.competency] ??= []).push(o)

  return {
    sessionId: session.sessionId,
    generatedAt: now.toISOString(),
    lang: session.lang,
    header: {
      repName: session.rep.displayName,
      physicianName: session.physician.name,
      specialty: session.specialty ? SPECIALTIES[session.specialty].name : null,
      difficulty: session.difficulty,
      outcome: session.status,
      repTurns: session.transcript.filter(t => t.role === 'rep').length,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    },
    transcript: session.transcript.map(t => ({ turnIndex: t.turnIndex, role: t.role, text: t.text, createdAt: t.createdAt })),
    observationsByCompetency,
    scores: session.scores,
    coaching: session.coaching,
    coachingStatus,
    warnings,
  }
}
