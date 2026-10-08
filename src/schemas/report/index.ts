import type { Competency, Observation } from '@/schemas/observation'
import type { SessionScore } from '@/schemas/scoring'
import type { CoachingRecommendation } from '@/schemas/coaching'
import type { Lang, SessionStatus } from '@/schemas/session'
import type { Difficulty } from '@/lib/voice-partner-core'

/** Only what the rep may see. Internal physician state and the doctor's hidden
 * concern are never part of the report. */
export interface ReportTurn {
  turnIndex: number
  role: 'doctor' | 'rep'
  text: string
  createdAt: string | null
}

export type CoachingStatus = 'ready' | 'nothing_to_coach' | 'unavailable'

export interface SessionReport {
  sessionId: string
  generatedAt: string
  lang: Lang
  header: {
    repName: string | null
    physicianName: string
    specialty: string | null
    difficulty: Difficulty
    outcome: SessionStatus
    repTurns: number
    startedAt: string | null
    endedAt: string | null
  }
  transcript: ReportTurn[]
  observationsByCompetency: Partial<Record<Competency, Observation[]>>
  scores: SessionScore
  coaching: CoachingRecommendation[]
  coachingStatus: CoachingStatus
  /** Non-fatal problems, e.g. "coaching_unavailable:upstream". */
  warnings: string[]
}
