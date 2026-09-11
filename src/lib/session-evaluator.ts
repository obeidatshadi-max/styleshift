import type { ConversationTurn } from '@/types/game'
import { classifyQuestions, type Turn } from '@/lib/roleplay-core'
import { isClearStep, isObjectionType, langName, type ClearStep, type ObjectionType } from '@/lib/voice-partner-core'

// ───────────────────────── ConversationObserver ─────────────────────────
// Phase 2 ("every score has evidence" — docs/ai-doctor-phase-1-plan.md's
// Deferred list). Pure, deterministic signal extraction from the persisted
// `conversation_turns` evidence store (migration 026) — no LLM call, no
// invented data. Text-only: the AI-Doctor path has no audio/timing capture
// (unlike roleplay-core.ts's acoustic pipeline), so there is no WPM/pause
// signal here — that's Phase 4 (Pressure Shift) once acoustic capture is
// added to this path, not simulated with fake numbers now.

export interface SessionSignals {
  repTurnCount: number
  doctorTurnCount: number
  avgRepTurnLength: number
  questionCount: number
  openQuestionCount: number
  closedQuestionCount: number
  openQuestionRatio: number
  objectionCounts: Partial<Record<ObjectionType, number>>
  clearStepsHitCount: number
  /** Each CLEAR step's first occurrence, in transcript order — a proxy for
   * whether the rep worked the objection-handling sequence in a sensible
   * order, not just whether they hit every step somewhere. */
  clearStepsSequence: ClearStep[]
  turnsToResolution: number
  /** First doctor turn_index after a rep turn that hit "clarify", only when
   * the doctor has a `hidden_concern` set — a heuristic proxy computed from
   * real persisted fields (clear_steps_hit, doctor.hidden_concern), not an
   * LLM guess. Null when there's no hidden concern to reveal, or the rep
   * never unlocked it. */
  hiddenConcernRevealTurnIndex: number | null
}

/** Adapts a persisted turn row to roleplay-core's `Turn` shape so its
 * regex-based question classifier can be reused as-is (per the Phase 2
 * plan — don't reinvent). `start`/`end`/`durationMs` are unused by
 * `classifyQuestions` (it only reads `speaker`/`text`) so turn_index is a
 * safe stand-in; there is no timing data for this path yet. */
function toRoleplayTurn(t: ConversationTurn): Turn {
  return { speaker: t.role, text: t.text, start: t.turn_index, end: t.turn_index, durationMs: 0 }
}

export function computeSessionSignals(turns: ConversationTurn[], hasHiddenConcern: boolean): SessionSignals {
  const sorted = [...turns].sort((a, b) => a.turn_index - b.turn_index)
  const repTurns = sorted.filter(t => t.role === 'rep')
  const doctorTurns = sorted.filter(t => t.role === 'doctor')

  const roleplayTurns = sorted.map(toRoleplayTurn)
  const breakdown = classifyQuestions(roleplayTurns, 'rep')

  const objectionCounts: Partial<Record<ObjectionType, number>> = {}
  for (const t of sorted) {
    if (t.objection_type && isObjectionType(t.objection_type)) {
      objectionCounts[t.objection_type] = (objectionCounts[t.objection_type] ?? 0) + 1
    }
  }

  const clearStepsSequence: ClearStep[] = []
  const seen = new Set<ClearStep>()
  let clearStepsHitCount = 0
  let hiddenConcernRevealTurnIndex: number | null = null
  for (const t of repTurns) {
    for (const step of t.clear_steps_hit) {
      if (!isClearStep(step)) continue
      clearStepsHitCount++
      if (!seen.has(step)) { seen.add(step); clearStepsSequence.push(step) }
    }
  }
  if (hasHiddenConcern) {
    const clarifyTurn = repTurns.find(t => t.clear_steps_hit.some(s => s === 'clarify'))
    if (clarifyTurn) {
      const nextDoctorTurn = doctorTurns.find(t => t.turn_index > clarifyTurn.turn_index)
      if (nextDoctorTurn) hiddenConcernRevealTurnIndex = nextDoctorTurn.turn_index
    }
  }

  const totalRepChars = repTurns.reduce((sum, t) => sum + t.text.length, 0)

  return {
    repTurnCount: repTurns.length,
    doctorTurnCount: doctorTurns.length,
    avgRepTurnLength: repTurns.length ? Math.round(totalRepChars / repTurns.length) : 0,
    questionCount: breakdown.total,
    openQuestionCount: breakdown.open,
    closedQuestionCount: breakdown.closed,
    openQuestionRatio: breakdown.openRatio,
    objectionCounts,
    clearStepsHitCount,
    clearStepsSequence,
    turnsToResolution: repTurns.length,
    hiddenConcernRevealTurnIndex,
  }
}

// ───────────────────────── CompetencyEvaluator ─────────────────────────
// Single post-session LLM call (see session-analysis/route.ts) — never part
// of the live judge call, per "keep live simulation separate from deep
// post-call analysis". The model is asked for turn_index REFERENCES ONLY,
// never quoted text — the route re-derives every quote/timestamp from the
// real persisted rows afterward, so evidence can never be fabricated.

export const COMPETENCY_DIMENSIONS = [
  'opening', 'questioning', 'discovery', 'listening', 'relevance',
  'value_communication', 'evidence_use', 'objection_handling', 'closing',
] as const
export type CompetencyDimension = typeof COMPETENCY_DIMENSIONS[number]

export interface CompetencyScore {
  /** 0-100, or null when the transcript genuinely doesn't exercise this
   * dimension (e.g. "closing" on a 1-turn escalated session) — never
   * fabricated to fill the slot. */
  score: number | null
  /** turn_index values, already filtered to ones that exist in this
   * session's real transcript (see groundEvaluatorResult). */
  turnRefs: number[]
  rationale: string
}

export type CompetencyScores = Record<CompetencyDimension, CompetencyScore>

/** Model output for one critical moment — interpretation only. Quote/role/
 * timestamp are never taken from the model; see `CriticalMoment`. */
interface RawCriticalMoment {
  turnIndex: number
  observedBehavior: string
  missedOpportunity: string | null
  alternative: string | null
}

interface RawEvaluatorResponse {
  competencies: Record<string, { score: unknown; turnRefs: unknown; rationale: unknown }>
  criticalMoments: RawCriticalMoment[]
}

/** Fully grounded critical moment — `quote`/`role`/`createdAt` are copied
 * server-side from the real `conversation_turns` row at `turnIndex`, never
 * taken from the model's output (the spec: "do not invent timestamps"). */
export interface CriticalMoment {
  turnIndex: number
  createdAt: string
  role: 'doctor' | 'rep'
  quote: string
  observedBehavior: string
  missedOpportunity: string | null
  alternative: string | null
}

export function buildEvaluatorPrompt(turns: ConversationTurn[], signals: SessionSignals, lang: 'en' | 'ar'): string {
  const sorted = [...turns].sort((a, b) => a.turn_index - b.turn_index)
  const transcript = sorted.map(t => `[${t.turn_index}] ${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  const dims = COMPETENCY_DIMENSIONS.join(', ')

  return `You are scoring a pharmaceutical sales rep's practice conversation with an AI-simulated doctor, AFTER the fact — you are not the doctor, you are an objective coaching evaluator. Write every text field in ${langName(lang)}.

Transcript (each line's number in brackets is its turn_index — you MUST refer to lines ONLY by these exact numbers, never invent a number that doesn't appear below):
${transcript}

Objective signals already computed from the transcript (for your context, not for you to re-derive): ${signals.repTurnCount} rep turns, ${signals.questionCount} questions asked (${signals.openQuestionCount} open, ${signals.closedQuestionCount} closed), CLEAR steps hit: ${signals.clearStepsSequence.join(', ') || 'none'}.

Score these ${COMPETENCY_DIMENSIONS.length} dimensions: ${dims}.
For each dimension, return a 0-100 score ONLY if the transcript actually gives you evidence for it — if this specific transcript doesn't exercise a dimension (e.g. the session ended before any closing attempt), return score: null and explain why in rationale rather than guessing a number. Cite 1-3 turnRefs (the [N] numbers above) that support your score — never cite a number not shown above.

Then identify 3 to 7 Critical Moments — points where the conversation materially changed (an objection landed, the rep missed an opening, a strong recovery, etc). For each: the turnIndex (one of the [N] numbers above), what the rep's behavior was (observedBehavior), what they missed if anything (missedOpportunity, or null if nothing was missed), and one concrete alternative response (alternative, or null if not applicable). Do NOT include the quoted text yourself — just the turnIndex; the exact words will be looked up separately.

Return JSON exactly in this shape, all ${COMPETENCY_DIMENSIONS.length} dimension keys present:
{
  "competencies": {
    "opening": { "score": 72, "turnRefs": [0, 1], "rationale": "..." },
    "questioning": { "score": null, "turnRefs": [], "rationale": "..." }
    // ...one entry per dimension listed above, same shape
  },
  "criticalMoments": [
    { "turnIndex": 3, "observedBehavior": "...", "missedOpportunity": "..." , "alternative": "..." }
  ]
}
Output ONLY the JSON object. No markdown fences, no commentary.`
}

function isRawCriticalMoment(v: unknown): v is RawCriticalMoment {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.turnIndex === 'number' && Number.isInteger(o.turnIndex)
    && typeof o.observedBehavior === 'string' && o.observedBehavior.trim().length > 0
    && (o.missedOpportunity === null || typeof o.missedOpportunity === 'string')
    && (o.alternative === null || typeof o.alternative === 'string')
}

/** Parses the raw model JSON. Deliberately permissive on per-dimension
 * score/turnRefs shape (coerced, not rejected) since a single malformed
 * field shouldn't discard an otherwise-valid response — but the top-level
 * shape (all 9 dimension keys present, criticalMoments an array of
 * well-formed entries) must be exactly right or this returns null and the
 * caller retries/fails per its own schema-failure policy. */
export function parseEvaluatorResponse(text: string): RawEvaluatorResponse | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.competencies !== 'object' || !o.competencies) return null
  const rawCompetencies = o.competencies as Record<string, unknown>
  const competencies: Record<string, { score: unknown; turnRefs: unknown; rationale: unknown }> = {}
  for (const dim of COMPETENCY_DIMENSIONS) {
    const entry = rawCompetencies[dim]
    if (!entry || typeof entry !== 'object') return null
    const e = entry as Record<string, unknown>
    competencies[dim] = { score: e.score, turnRefs: e.turnRefs, rationale: e.rationale }
  }
  if (!Array.isArray(o.criticalMoments)) return null
  const criticalMoments = o.criticalMoments.filter(isRawCriticalMoment)
  return { competencies, criticalMoments }
}

/** Grounds the raw model response against the real transcript: clamps/
 * coerces scores, drops any turnRef/turnIndex the model cited that isn't an
 * actual turn_index in this session (never trusts the model's own numbers
 * blindly), and — critically — replaces every critical moment's evidence
 * with the REAL row's text/role/created_at rather than anything the model
 * said, so nothing in the final output can be fabricated. */
export function groundEvaluatorResult(
  raw: RawEvaluatorResponse, turns: ConversationTurn[],
): { competencies: CompetencyScores; criticalMoments: CriticalMoment[] } {
  const byIndex = new Map(turns.map(t => [t.turn_index, t]))
  const validIndex = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && byIndex.has(n)

  const competencies = {} as CompetencyScores
  for (const dim of COMPETENCY_DIMENSIONS) {
    const entry = raw.competencies[dim]
    const score = typeof entry.score === 'number' && Number.isFinite(entry.score)
      ? Math.max(0, Math.min(100, Math.round(entry.score))) : null
    const turnRefs = Array.isArray(entry.turnRefs) ? entry.turnRefs.filter(validIndex) : []
    const rationale = typeof entry.rationale === 'string' ? entry.rationale : ''
    competencies[dim] = { score, turnRefs, rationale }
  }

  const criticalMoments: CriticalMoment[] = []
  for (const m of raw.criticalMoments) {
    const row = byIndex.get(m.turnIndex)
    if (!row) continue // model cited a turn_index that doesn't exist — drop, never invent one
    criticalMoments.push({
      turnIndex: row.turn_index,
      createdAt: row.created_at,
      role: row.role,
      quote: row.text,
      observedBehavior: m.observedBehavior,
      missedOpportunity: m.missedOpportunity,
      alternative: m.alternative,
    })
  }
  criticalMoments.sort((a, b) => a.turnIndex - b.turnIndex)

  return { competencies, criticalMoments }
}
