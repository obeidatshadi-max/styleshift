import type { Observation } from '@/schemas/observation'
import type { SessionScore } from '@/schemas/scoring'
import type { SessionReport } from '@/schemas/report'
import type { StyleShiftSession } from '@/schemas/session'
import type { Difficulty } from '@/lib/voice-partner-core'
import type { DoctorInput, DoctorReply } from '@/agents/doctor'
import type { AnalystError, AnalystResult } from '@/agents/behaviorAnalyst'
import type { CoachError, CoachResult } from '@/agents/coach'

// ───────────────────────────── Workflow state ─────────────────────────────

/** Where a session is in the workflow. `reported` is terminal. A failed step
 * leaves the phase unchanged, so calling the same step again resumes it. */
export type Phase = 'in_roleplay' | 'ended' | 'analyzed' | 'scored' | 'reported'

export type Step =
  | 'create_session' | 'load_persona' | 'doctor_open' | 'doctor_reply'
  | 'end_simulation' | 'analyze' | 'score' | 'coach' | 'report'

export interface TraceEntry { step: Step; at: string; ok: boolean; detail?: string }

/** What the store persists: the shared session plus workflow bookkeeping. */
export interface SessionRecord {
  session: StyleShiftSession
  phase: Phase
  trace: TraceEntry[]
  report: SessionReport | null
}

// ───────────────────────────── Ports ─────────────────────────────
// The orchestrator depends only on these. Specialist work lives behind them.

export interface SessionStore {
  get(sessionId: string): Promise<SessionRecord | null>
  save(record: SessionRecord): Promise<void>
}

export type PersonaData = Pick<StyleShiftSession, 'rep' | 'physician' | 'specialty' | 'socialStyle' | 'objections' | 'product'>

export interface PersonaLoader {
  /** null when the doctor does not exist or does not belong to this rep. */
  load(repId: string, doctorId: string, opts: { difficulty: Difficulty }): Promise<PersonaData | null>
}

export interface DoctorPort {
  respond(session: Readonly<StyleShiftSession>, input: DoctorInput): Promise<DoctorReply | null>
}
export interface AnalystPort {
  analyze(session: Readonly<StyleShiftSession>): Promise<AnalystResult | { error: AnalystError }>
}
export interface CoachPort {
  coach(session: Readonly<StyleShiftSession>): Promise<CoachResult | { error: CoachError }>
}
/** Deterministic scoring — no model involved. */
export type Scorer = (observations: Observation[], difficulty: Difficulty) => SessionScore

// ───────────────────────────── Results ─────────────────────────────

export type OrchestratorError =
  | 'not_found' | 'forbidden' | 'persona_not_found' | 'empty_message' | 'wrong_phase'
  | 'turn_limit' | 'doctor_unavailable' | 'no_rep_turns' | 'analysis_failed' | 'store_failed'

export type Result<T> = ({ ok: true } & T) | { ok: false; error: OrchestratorError; detail?: string }
