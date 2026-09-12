import type { ConversationTurn } from '@/types/game'
import { classifyQuestions, computeQuestionRatio, computeParaphraseScore, type Turn } from '@/lib/roleplay-core'

// Phase 4 ("Pressure Shift" — docs/ai-doctor-phase-1-plan.md's Deferred list,
// docs/ai-doctor-gap-analysis.md's "Pressure Shift" row). Pure, deterministic
// signal extraction from the persisted `conversation_turns` evidence store —
// same "server computes, model only interprets" split as Phase 2's
// ConversationObserver.
//
// SCOPE DECISION: this is a text-only v1. The original Phase 1 plan named
// Phase 4 as requiring "acoustic capture added to the AI Doctor path" so
// before/after pace/pitch/pause could be compared like roleplay-core.ts does
// for the human-colleague path. That capture does not exist and is a
// materially bigger lift than the rest of this phase: `useAudioRecorder.ts`
// only owns a MediaRecorder blob (record -> upload -> Whisper transcribe) —
// there is no Web Audio AnalyserNode, no client-side pitch/silence sampling,
// and no equivalent of the human-colleague path's AssemblyAI diarization
// step. Building real-time pitch detection plus a client instrumentation
// pass is its own initiative, not a "wire it up" task, and would block a
// shippable Phase 4 on the hardest sub-problem. So: this module compares
// TEXT-DERIVED signals only (all already reliably captured per turn since
// Phase 1) before vs after a detected pressure moment, using the exact
// physician-state snapshot columns (`trust`/`skepticism`/`engagement`/
// `time_pressure`) migration 026 staged specifically for this. Acoustic
// capture stays a named, deferred follow-up (see migration 029's header
// comment) — not silently dropped, not faked with placeholder numbers.

/** Adapts a persisted turn row to roleplay-core's `Turn` shape, same stand-in
 * session-evaluator.ts's `toRoleplayTurn` already uses: `classifyQuestions`/
 * `computeQuestionRatio`/`computeParaphraseScore` only read `speaker`/`text`,
 * never `start`/`end`/`durationMs`, so turn_index is a safe non-timing
 * placeholder — there is no real timing data on this path. */
function toRoleplayTurn(t: ConversationTurn): Turn {
  return { speaker: t.role, text: t.text, start: t.turn_index, end: t.turn_index, durationMs: 0 }
}

export interface PressureMoment {
  /** turn_index of the doctor turn whose state snapshot crossed the
   * pressure threshold relative to the previous doctor turn's snapshot. */
  turnIndex: number
  trustDelta: number
  skepticismDelta: number
  engagementDelta: number
  timePressureDelta: number
  /** skepticismDelta + timePressureDelta - trustDelta - engagementDelta.
   * Positive = pressure increased (skepticism/time-pressure up and/or
   * trust/engagement down). See PRESSURE_THRESHOLD below for the trigger. */
  pressureIndex: number
}

export interface WindowMetrics {
  turnCount: number
  avgWordsPerTurn: number
  questionRatio: number
  openQuestionRatio: number
  paraphraseScore: number
  /** Distinct CLEAR steps hit, per rep turn, in this window. */
  clearStepsPerTurn: number
}

export interface PressureShiftResult {
  moment: PressureMoment
  before: WindowMetrics
  after: WindowMetrics
}

// DECISION (flagged, tunable): each state-delta column is written per turn as
// a -10..+10 value (see turn/route.ts's `nextState` application, per the
// Phase 1 plan's 1.3). A single dominant swing alone (e.g. trust -10, nothing
// else moving) would give pressureIndex = 10; requiring >= 12 means at least
// a mild SECOND signal has to move in the same direction too (e.g. trust -10
// AND skepticism +2, or two moderate -6/+6 moves) before this counts as a
// "pressure moment" rather than single-metric noise. This threshold is not
// derived from real session data (none exists yet) — Shadi should revisit it
// once real sessions accumulate and it's possible to check how often this
// actually fires vs. how often reps recognize a moment as a real pressure
// point.
const PRESSURE_THRESHOLD = 12

// DECISION (flagged, tunable): BEFORE is capped at the 2 rep turns
// immediately preceding the pressure moment (not all preceding turns) so an
// easy opening exchange doesn't dilute the "how were they behaving right
// before this got hard" baseline — TURN_CAP is 5 rep turns per session
// (voice-partner-core.ts), so 2 is already a meaningful fraction of a full
// session. AFTER intentionally has NO cap: it runs to the end of the
// session. With only 5 rep turns total, "did they recover for the rest of
// the conversation" is more useful to a rep than a single next-reply
// snapshot, and capping it symmetrically at 2 would throw away turns 4-5 in
// a session where the pressure moment lands turn 2.
const BEFORE_WINDOW_MAX = 2

/**
 * First doctor turn whose state snapshot moved against the rep by at least
 * PRESSURE_THRESHOLD, compared to the immediately preceding doctor turn's
 * snapshot. Returns null if no doctor turn crosses the threshold, or if
 * fewer than 2 doctor turns have a complete state snapshot (nothing to
 * compare) — sessions seeded before Phase 1 shipped, or any row with a null
 * state column, are silently skipped rather than compared against a
 * fabricated baseline.
 */
export function findPressureMoment(turns: ConversationTurn[]): PressureMoment | null {
  const doctorTurns = [...turns]
    .filter(t => t.role === 'doctor' && t.trust != null && t.skepticism != null && t.engagement != null && t.time_pressure != null)
    .sort((a, b) => a.turn_index - b.turn_index)

  for (let i = 1; i < doctorTurns.length; i++) {
    const prev = doctorTurns[i - 1]
    const cur = doctorTurns[i]
    const trustDelta = cur.trust! - prev.trust!
    const skepticismDelta = cur.skepticism! - prev.skepticism!
    const engagementDelta = cur.engagement! - prev.engagement!
    const timePressureDelta = cur.time_pressure! - prev.time_pressure!
    const pressureIndex = skepticismDelta + timePressureDelta - trustDelta - engagementDelta
    if (pressureIndex >= PRESSURE_THRESHOLD) {
      return { turnIndex: cur.turn_index, trustDelta, skepticismDelta, engagementDelta, timePressureDelta, pressureIndex }
    }
  }
  return null
}

function computeWindowMetrics(repTurns: ConversationTurn[]): WindowMetrics {
  const roleplayTurns = repTurns.map(toRoleplayTurn)
  const totalWords = repTurns.reduce((sum, t) => sum + (t.text.trim() ? t.text.trim().split(/\s+/).length : 0), 0)
  const totalClearSteps = repTurns.reduce((sum, t) => sum + t.clear_steps_hit.length, 0)
  return {
    turnCount: repTurns.length,
    avgWordsPerTurn: repTurns.length ? Math.round(totalWords / repTurns.length) : 0,
    questionRatio: computeQuestionRatio(roleplayTurns, 'rep'),
    openQuestionRatio: classifyQuestions(roleplayTurns, 'rep').openRatio,
    paraphraseScore: computeParaphraseScore(roleplayTurns, 'rep'),
    clearStepsPerTurn: repTurns.length ? totalClearSteps / repTurns.length : 0,
  }
}

/**
 * Full Pressure Shift computation: finds the pressure moment, then compares
 * rep-turn behavior in the BEFORE window (last <= BEFORE_WINDOW_MAX rep turns
 * strictly before the moment) against the AFTER window (every rep turn from
 * the moment's turn_index onward). Returns null when no pressure moment is
 * found, or when either window would be empty (e.g. the pressure moment is
 * the doctor's opening line with no prior rep turn, or the session escalates
 * on that exact turn with no further rep reply to observe) — there is
 * nothing honest to compare in either case, so this reports "not applicable"
 * rather than comparing against an empty/fabricated window.
 */
export function computePressureShift(turns: ConversationTurn[]): PressureShiftResult | null {
  const moment = findPressureMoment(turns)
  if (!moment) return null

  const sorted = [...turns].sort((a, b) => a.turn_index - b.turn_index)
  const before = sorted.filter(t => t.role === 'rep' && t.turn_index < moment.turnIndex).slice(-BEFORE_WINDOW_MAX)
  const after = sorted.filter(t => t.role === 'rep' && t.turn_index >= moment.turnIndex)
  if (before.length === 0 || after.length === 0) return null

  return { moment, before: computeWindowMetrics(before), after: computeWindowMetrics(after) }
}
