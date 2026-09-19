import type { Specialty, StyleKey } from '@/types/game'
import type { SpsKey, SpsResult } from '@/lib/sps-core'
import type { VocalFeedback } from '@/lib/oruk'
import type {
  ClearStep, Difficulty, ObjectionType, PhysicianState, StyleWeights,
} from '@/lib/voice-partner-core'
import type { Observation } from '@/schemas/observation'
import type { SessionScore } from '@/schemas/scoring'
import type { CoachingRecommendation } from '@/schemas/coaching'

/**
 * The single shared StyleShift session object. The orchestrator builds it once
 * from existing tables (profiles, doctors, doctor_visits, conversation_turns,
 * session_scorecards); every agent receives it, and returns a patch to it.
 * Agents never query Supabase themselves.
 *
 * Field types deliberately reuse the app's existing types (StyleKey,
 * Specialty, ObjectionType, ClearStep, Difficulty, PhysicianState) so nothing
 * here can drift from what the live routes already accept.
 */

export type Lang = 'en' | 'ar'

export type SessionStatus = 'in_progress' | 'won' | 'escalated' | 'abandoned'

// ───────────────────────────── Medical rep ─────────────────────────────

export interface MedicalRep {
  repId: string
  displayName: string | null
  companyId: string | null
  /** The rep's own Sales-Person-Style result (profiles.sps_profile). */
  spsTopKey: SpsKey | null
  spsProfile: SpsResult | null
}

// ─────────────────────────── Physician (persona) ───────────────────────────

/** Social style: single legacy style and/or the weighted 4-style blend. */
export interface PhysicianSocialStyle {
  /** doctors.style — null when the rep has not typed the doctor yet. */
  primary: StyleKey | null
  /** Normalized 0-1, sums to 1; even split when nothing is known. */
  weights: StyleWeights
  dominant: StyleKey | null
  source: 'weighted' | 'legacy' | 'unknown'
  assertiveness: 'ask' | 'tell' | null
  responsiveness: 'controls' | 'emotes' | null
}

export interface PhysicianPersona {
  doctorId: string | null
  name: string
  workplace: string | null
  keyPhrases: string | null
  /** Never volunteered by the doctor unless the rep earns it (CLEAR: clarify). */
  hiddenConcern: string | null
  notes: string | null
  meetingStage: string | null
  availableTimeMin: number | null
  /** Live trust / skepticism / engagement / time-pressure at session start. */
  initialState: PhysicianState | null
}

// ───────────────────────────── Objections ─────────────────────────────

export interface SessionObjections {
  /** Type driving this session's doctor behavior; null before it is picked. */
  activeType: ObjectionType | null
  /** Free-text objections recorded on the doctor's profile (doctors.objections). */
  onProfile: string[]
  notes: string | null
}

// ───────────────────────────── Training focus ─────────────────────────────

export interface TrainingProduct {
  /** Deliberately generic — agents must never invent clinical data about it. */
  name: string | null
  /** doctors.product_context. */
  context: string | null
}

export interface LearningObjective {
  id: string
  label: string
  focusStep: ClearStep | null
  targetObjection: ObjectionType | null
  source: 'default' | 'assignment' | 'coach' | 'manager' | 'rep'
}

// ───────────────────────────── Transcript ─────────────────────────────

/** camelCase mirror of a conversation_turns row. */
export interface TranscriptTurn {
  turnIndex: number
  role: 'doctor' | 'rep'
  text: string
  objectionType: ObjectionType | null
  /** CLEAR steps the judge saw the rep hit on this turn (rep turns only). */
  clearStepsHit: ClearStep[]
  /** Physician state AFTER this turn. */
  state: PhysicianState | null
  vocalFeedback: VocalFeedback | null
  createdAt: string | null
}

// ───────────────────────────── The session ─────────────────────────────

export interface StyleShiftSession {
  sessionId: string
  lang: Lang
  status: SessionStatus
  startedAt: string | null
  endedAt: string | null

  rep: MedicalRep
  physician: PhysicianPersona
  specialty: Specialty | null
  socialStyle: PhysicianSocialStyle
  difficulty: Difficulty
  objections: SessionObjections
  product: TrainingProduct
  learningObjectives: LearningObjective[]

  transcript: TranscriptTurn[]

  // Filled in by agents, in order: behaviorAnalyst -> scoring -> coach.
  observations: Observation[]
  scores: SessionScore | null
  coaching: CoachingRecommendation[]
}

/** What an agent may change: only the sections it owns. The orchestrator
 * merges patches; agents cannot rewrite the transcript or persona. */
export type SessionPatch = Partial<
  Pick<StyleShiftSession, 'transcript' | 'status' | 'endedAt' | 'observations' | 'scores' | 'coaching'>
>
