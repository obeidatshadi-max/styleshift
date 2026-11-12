import type { ConversationTurn, Doctor, StyleKey } from '@/types/game'
import { classifyQuestions, type Turn } from '@/lib/roleplay-core'
import { isClearStep, isObjectionType, langName, styleWeights, type ClearStep, type ObjectionType } from '@/lib/voice-partner-core'
import { STYLES } from '@/lib/game-data'
import type { PressureShiftResult } from '@/lib/pressure-shift'
import { computeRealtimeSignals, type RealtimeSignals } from '@/lib/voice-partner-timing'
import { CONTEXT_COACHING_RULES } from '@/lib/context-coaching'

// ───────────────────────── Evaluator request ─────────────────────────
// The exact request /api/voice-partner/session-analysis sends. Kept here, not in the
// route, so tools/benchmark repeat runs score with the same prompt the product uses.

// Same hard guardrail as the live judge/opening prompts (voice-partner-core's
// SYSTEM) — this call only coaches communication style from a given
// transcript, but rationale/alternative text must not drift into inventing
// clinical claims that were never in the conversation.
// The shared context rules (never infer pace or tone from text, a temporary reaction
// is not a trait...) are part of every analysis prompt; the evaluator was the one
// prompt without them (validation audit 2026-11-12, W2).
export const EVALUATOR_SYSTEM = 'You are an objective sales-coaching evaluator, not a clinician. Score and comment on COMMUNICATION STYLE only. NEVER invent clinical data, efficacy numbers, statistics, trial results, or real/branded drug names — refer to evidence only as generically as the transcript itself does. Output ONLY a single valid JSON object, no markdown fences, no commentary. ' + CONTEXT_COACHING_RULES
/** Stored with each scorecard (in `signals`). Bump on any change to the evaluator prompt
 * or grounding, so the validation pilot never pools scores from two versions. */
export const EVALUATOR_PROMPT_VERSION = 'eval-2.0.0'
export const EVALUATOR_MODEL = 'claude-haiku-4-5-20251001'
export const EVALUATOR_MAX_TOKENS = 2000
export const EVALUATOR_RETRY_NOTE = '\n\nYour previous response was not valid JSON matching the exact shape requested. Return ONLY the JSON object, exactly as specified, with no markdown fences and no other text.'

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
  /** Null for a text-based-path session (no speech timing exists to derive
   * this from) — see voice-partner-timing.ts's "report not applicable
   * rather than fabricate" rule. */
  realtimeSignals: RealtimeSignals | null
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
    realtimeSignals: computeRealtimeSignals(sorted),
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
  adaptation: Record<string, { score: unknown; turnRefs: unknown; rationale: unknown }>
  adaptationRecommendation: unknown
  criticalMoments: RawCriticalMoment[]
  /** One sentence interpreting the Phase 4 before/after Pressure Shift
   * numbers (see pressure-shift.ts) — only requested when a pressure moment
   * was actually detected. Never a source of the numbers themselves; those
   * are computed deterministically and passed IN to the prompt, same
   * "server derives, model only interprets" rule as everything else here. */
  pressureShiftInsight?: unknown
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

// ───────────────────────── AdaptationAnalyzer ─────────────────────────
// Phase 3 ("evaluate how well the rep adapted to THIS physician — do not
// assume one ideal sales behavior works with all doctors" — the master
// spec's ADAPTATION SCORE™ section). Folded into the SAME post-session call
// as the CompetencyEvaluator above rather than a second LLM round trip: the
// AI-Doctor transcript is short (TURN_CAP=5 rep turns, see
// voice-partner-core.ts), so the added prompt/response size stays modest,
// and this is conceptually the same "run Deep Analysis" action a rep
// triggers once per session — a second call would double cost/latency for
// no correctness benefit.

const STYLE_KEYS: readonly StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']
const EVEN_WEIGHTS: Record<StyleKey, number> = { driver: 0.25, expressive: 0.25, amiable: 0.25, analytical: 0.25 }

export interface DoctorStyleProfile {
  /** Normalized 0-1, always sums to 1 (even split when nothing is known
   * about this doctor's style at all). */
  weights: Record<StyleKey, number>
  dominant: StyleKey | null
  /** 'weighted' = doctor's 4 style_* columns (Phase 1); 'legacy' = the
   * single `style` column, 100% that one style; 'unknown' = neither is set. */
  source: 'weighted' | 'legacy' | 'unknown'
}

/** Resolves what THIS doctor's persona actually calls for — reuses
 * voice-partner-core's `styleWeights` (the exact nullable-weight-columns
 * logic the live judge prompt already applies) rather than re-deriving it,
 * then normalizes to fractions summing to 1 for scoring/display use. */
export function resolveDoctorStyleProfile(
  d: Pick<Doctor, 'style' | 'style_driver' | 'style_expressive' | 'style_amiable' | 'style_analytical'>,
): DoctorStyleProfile {
  const raw = styleWeights(d as Doctor)
  if (raw) {
    const total = raw.driver + raw.expressive + raw.amiable + raw.analytical
    if (total > 0) {
      const weights: Record<StyleKey, number> = {
        driver: raw.driver / total, expressive: raw.expressive / total,
        amiable: raw.amiable / total, analytical: raw.analytical / total,
      }
      const dominant = STYLE_KEYS.reduce((best, k) => (weights[k] > weights[best] ? k : best), STYLE_KEYS[0])
      return { weights, dominant, source: 'weighted' }
    }
  }
  if (d.style) {
    const weights: Record<StyleKey, number> = { driver: 0, expressive: 0, amiable: 0, analytical: 0 }
    weights[d.style] = 1
    return { weights, dominant: d.style, source: 'legacy' }
  }
  return { weights: EVEN_WEIGHTS, dominant: null, source: 'unknown' }
}

/** Prompt context explaining WHAT this doctor's blend calls for — reuses
 * game-data.ts's existing style `blurb` copy (the same text the app already
 * shows reps elsewhere) rather than inventing new descriptor language. */
function styleNeedsLine(profile: DoctorStyleProfile): string {
  if (profile.source === 'unknown' || !profile.dominant) {
    return "This doctor's communication-style profile is not configured — score adaptation cautiously; prefer null over a guess where the transcript gives no clear signal either way."
  }
  const parts = STYLE_KEYS
    .map(k => ({ k, pct: Math.round(profile.weights[k] * 100) }))
    .filter(p => p.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map(p => `${p.pct}% ${p.k} (${STYLES[p.k].blurb})`)
  return `This doctor's configured communication-style profile (background only): ${parts.join(', ')}. Score adaptation against what THIS doctor visibly asked for or reacted to in THIS conversation (a stated time limit, a request for detail, a short reply, a question left unanswered). The profile can explain a reading but is never evidence by itself: when the doctor's lines show nothing to adapt to on a dimension, return null for it.`
}

/** Behavioral anchors per band, taken from the human rubric (docs/validation/human-rating-rubric.md
 * section 3, hrr-1.0.0). The bands match the pilot's fixed cut points (rubric section 6), so
 * the evaluator and the human raters use the same meaning for each band. */
const EVALUATOR_ANCHORS = `Use these bands. They match the human raters' 1-5 scale: 0-19 = 1, 20-39 = 2, 40-59 = 3, 60-79 = 4, 80-100 = 5.
- 80-100 (strong): repeated, clearly effective, context-appropriate behavior, shown MORE THAN ONCE. Needs at least two separate turnRefs. One good moment is 60-79 at most.
- 60-79 (good): effective and appropriate in most of the conversation.
- 40-59 (adequate): reasonable, with clear gaps or inconsistency.
- 20-39 (weak): some attempt, mostly ineffective or inappropriate.
- 0-19 (works against the aim): needs evidence of a problem, not just absence. If nothing happened, return null, not a low score.
If unsure between two bands, give the lower one and say why in the rationale.
Domain anchors:
- opening: strong = purpose in one or two sentences that fits the doctor's stated time; adequate = purpose given but long or generic; works against = product pitch before saying why, or never says why.
- questioning / discovery: strong = two or more open questions that change what is said next, with follow-up; adequate = some questions, mostly yes/no; works against = no questions, or only leading ones.
- listening: strong = repeats back the doctor's point accurately more than once and responds to it; adequate = acknowledges but often answers a different point; works against = ignores or contradicts what the doctor said.
- evidence_use / value_communication / relevance: strong = statements stay general to what the transcript supports and are tied to this doctor's concern, more than once; adequate = accurate but generic; works against = a clinical, safety or comparative claim the conversation does not support, or avoiding a direct safety question.
- objection_handling: strong = asks what is behind the objection, restates it, then answers that point; adequate = answers the objection as stated without checking; works against = argues, dismisses, or answers a different objection.
- closing: strong = a specific next step the doctor accepts, with who does what; adequate = a vague next step; works against = no next step although one was available. Null when the doctor ended the conversation first.
- adaptation dimensions: strong = detail, directness, structure or questioning visibly change to fit what this doctor asked for, more than once; adequate = some adjustment, inconsistent; works against = same approach regardless of what the doctor asked for.`

/** Pace and warmth are delivery: speed and tone. A text transcript shows neither, so both stay
 * null unless real speech timing exists for the session. */
const DELIVERY_ONLY_DIMENSIONS: readonly AdaptationDimension[] = ['pace', 'warmth']

export const ADAPTATION_DIMENSIONS = [
  'pace', 'detail', 'evidence_orientation', 'questioning', 'structure', 'directness', 'warmth',
] as const
export type AdaptationDimension = typeof ADAPTATION_DIMENSIONS[number]

export interface AdaptationDimensionScore {
  /** 0-100, or null when the transcript genuinely doesn't give evidence for
   * this dimension — never fabricated to fill the slot, same rule as
   * `CompetencyScore.score`. */
  score: number | null
  turnRefs: number[]
  rationale: string
}
export type AdaptationScores = Record<AdaptationDimension, AdaptationDimensionScore>

// DECISION: Pressure Shift's before/after numbers are computed
// deterministically (pressure-shift.ts) and handed to the model as CONTEXT,
// not derived by it — same anti-hallucination split as `signals` above. The
// model only writes one interpretive sentence, and only when a moment was
// actually found; when `pressureShift` is null (no doctor turn crossed the
// threshold this session) the prompt omits the section entirely and asks for
// an empty string, rather than asking the model to guess whether pressure
// occurred.
function pressureShiftLine(pressureShift: PressureShiftResult | null): string {
  if (!pressureShift) {
    return 'No Pressure Shift moment was detected in this session (the physician\'s trust/skepticism/engagement/time-pressure state never swung sharply against the rep) — leave pressureShiftInsight as an empty string.'
  }
  const { moment, before, after } = pressureShift
  return `A Pressure Shift moment was detected at turn_index ${moment.turnIndex} (the doctor's trust dropped ${-moment.trustDelta} and skepticism rose ${moment.skepticismDelta}). Compare the rep's own behavior just BEFORE this moment vs. AFTER it (already computed from real turns, not for you to re-derive):
- Before: ${before.turnCount} rep turn(s), avg ${before.avgWordsPerTurn} words/turn, ${Math.round(before.questionRatio * 100)}% of turns were questions (${Math.round(before.openQuestionRatio * 100)}% open-ended), ${before.clearStepsPerTurn.toFixed(1)} CLEAR steps/turn.
- After: ${after.turnCount} rep turn(s), avg ${after.avgWordsPerTurn} words/turn, ${Math.round(after.questionRatio * 100)}% of turns were questions (${Math.round(after.openQuestionRatio * 100)}% open-ended), ${after.clearStepsPerTurn.toFixed(1)} CLEAR steps/turn.
Write ONE sentence for pressureShiftInsight describing how the rep's communication actually changed once pressure hit (e.g. went quieter/more clipped, kept asking open questions, stopped using CLEAR steps) and whether that shift helped or hurt them with this doctor. Ground it only in the numbers above — do not invent tone/emotion the numbers don't support.`
}

export function buildEvaluatorPrompt(
  turns: ConversationTurn[], signals: SessionSignals, styleProfile: DoctorStyleProfile, lang: 'en' | 'ar',
  pressureShift: PressureShiftResult | null = null,
): string {
  const sorted = [...turns].sort((a, b) => a.turn_index - b.turn_index)
  const transcript = sorted.map(t => `[${t.turn_index}] ${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  const dims = COMPETENCY_DIMENSIONS.join(', ')
  const adaptationDims = ADAPTATION_DIMENSIONS.join(', ')

  return `You are scoring a pharmaceutical sales rep's practice conversation with an AI-simulated doctor, AFTER the fact — you are not the doctor, you are an objective coaching evaluator. Write every text field in ${langName(lang)}.

Transcript (each line's number in brackets is its turn_index — you MUST refer to lines ONLY by these exact numbers, never invent a number that doesn't appear below):
${transcript}

Objective signals already computed from the transcript (for your context, not for you to re-derive): ${signals.repTurnCount} rep turns, ${signals.questionCount} questions asked (${signals.openQuestionCount} open, ${signals.closedQuestionCount} closed), CLEAR steps hit: ${signals.clearStepsSequence.join(', ') || 'none'}.

Score these ${COMPETENCY_DIMENSIONS.length} dimensions: ${dims}.
For each dimension, return a 0-100 score ONLY if the transcript actually gives you evidence for it — if this specific transcript doesn't exercise a dimension (e.g. the session ended before any closing attempt), return score: null and explain why in rationale rather than guessing a number. Cite 1-3 turnRefs (the [N] numbers above) that support your score — never cite a number not shown above.

${EVALUATOR_ANCHORS}

${styleNeedsLine(styleProfile)}
Separately, score these ${ADAPTATION_DIMENSIONS.length} ADAPTATION dimensions the same way (0-100 or null + turnRefs + rationale): ${adaptationDims}. Each answers "did the rep adjust to what THIS doctor visibly asked for or reacted to in this conversation" — not a generic sales ideal, and not a style stereotype.
${signals.realtimeSignals ? 'Real speech timing exists for this session, but you only see words: score pace and warmth only from what the doctor said about them (for example "slow down"), otherwise null.' : 'This is a text transcript with no speech timing: pace and warmth (speed and tone of delivery) cannot be observed. Return score: null for both.'}
Then write ONE concrete adaptationRecommendation sentence. It MUST quote or point to what this doctor actually said or did in the transcript — never a generic tip like "be more empathetic" that could apply to any doctor, and never a style label as the reason on its own.

Then identify 3 to 7 Critical Moments — points where the conversation materially changed (an objection landed, the rep missed an opening, a strong recovery, etc). For each: the turnIndex (one of the [N] numbers above), what the rep's behavior was (observedBehavior), what they missed if anything (missedOpportunity, or null if nothing was missed), and one concrete alternative response (alternative, or null if not applicable). Do NOT include the quoted text yourself — just the turnIndex; the exact words will be looked up separately.

${pressureShiftLine(pressureShift)}

Return JSON exactly in this shape, all ${COMPETENCY_DIMENSIONS.length} competency keys and all ${ADAPTATION_DIMENSIONS.length} adaptation keys present:
{
  "competencies": {
    "opening": { "score": 72, "turnRefs": [0, 1], "rationale": "..." },
    "questioning": { "score": null, "turnRefs": [], "rationale": "..." }
    // ...one entry per dimension listed above, same shape
  },
  "adaptation": {
    "pace": { "score": 65, "turnRefs": [1], "rationale": "..." }
    // ...one entry per adaptation dimension listed above, same shape
  },
  "adaptationRecommendation": "one sentence naming this doctor's dominant style, grounded in real transcript evidence",
  "criticalMoments": [
    { "turnIndex": 3, "observedBehavior": "...", "missedOpportunity": "..." , "alternative": "..." }
  ],
  "pressureShiftInsight": "one sentence, or empty string if no Pressure Shift moment was described above"
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
/** Shared per-dimension-key extraction for both `competencies` and
 * `adaptation` blocks — returns null (caller fails the whole parse) unless
 * every dimension key is present as an object, same strict-top-level-shape
 * rule as before Phase 3 introduced a second dimension set. */
function extractDimensions(
  source: unknown, dims: readonly string[],
): Record<string, { score: unknown; turnRefs: unknown; rationale: unknown }> | null {
  if (!source || typeof source !== 'object') return null
  const src = source as Record<string, unknown>
  const out: Record<string, { score: unknown; turnRefs: unknown; rationale: unknown }> = {}
  for (const dim of dims) {
    const entry = src[dim]
    if (!entry || typeof entry !== 'object') return null
    const e = entry as Record<string, unknown>
    out[dim] = { score: e.score, turnRefs: e.turnRefs, rationale: e.rationale }
  }
  return out
}

export function parseEvaluatorResponse(text: string): RawEvaluatorResponse | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o) return null
  const competencies = extractDimensions(o.competencies, COMPETENCY_DIMENSIONS)
  if (!competencies) return null
  const adaptation = extractDimensions(o.adaptation, ADAPTATION_DIMENSIONS)
  if (!adaptation) return null
  if (!Array.isArray(o.criticalMoments)) return null
  const criticalMoments = o.criticalMoments.filter(isRawCriticalMoment)
  return {
    competencies, adaptation, adaptationRecommendation: o.adaptationRecommendation, criticalMoments,
    pressureShiftInsight: o.pressureShiftInsight,
  }
}

/** Grounds the raw model response against the real transcript: clamps/
 * coerces scores, drops any turnRef/turnIndex the model cited that isn't an
 * actual turn_index in this session (never trusts the model's own numbers
 * blindly), and — critically — replaces every critical moment's evidence
 * with the REAL row's text/role/created_at rather than anything the model
 * said, so nothing in the final output can be fabricated. */
export function groundEvaluatorResult(
  raw: RawEvaluatorResponse, turns: ConversationTurn[],
): {
  competencies: CompetencyScores; adaptation: AdaptationScores; adaptationScore: number | null
  adaptationRecommendation: string; criticalMoments: CriticalMoment[]; pressureShiftInsight: string
} {
  const byIndex = new Map(turns.map(t => [t.turn_index, t]))
  const validIndex = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && byIndex.has(n)

  // Deterministic band rules from the human rubric, enforced here rather than trusted to the model:
  // a score with no real turn behind it is null; the top band (80+) needs two separate turns.
  function groundDimension(entry: { score: unknown; turnRefs: unknown; rationale: unknown }) {
    const turnRefs = Array.isArray(entry.turnRefs) ? [...new Set(entry.turnRefs.filter(validIndex))] : []
    let score = typeof entry.score === 'number' && Number.isFinite(entry.score)
      ? Math.max(0, Math.min(100, Math.round(entry.score))) : null
    if (score !== null && turnRefs.length === 0) score = null
    if (score !== null && score >= 80 && turnRefs.length < 2) score = 79
    const rationale = typeof entry.rationale === 'string' ? entry.rationale : ''
    return { score, turnRefs, rationale }
  }

  const competencies = {} as CompetencyScores
  for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = groundDimension(raw.competencies[dim])

  // Pace and warmth are speed and tone. Without real speech timing they are not observable.
  const hasTiming = computeRealtimeSignals(turns) !== null
  const adaptation = {} as AdaptationScores
  for (const dim of ADAPTATION_DIMENSIONS) {
    const g = groundDimension(raw.adaptation[dim])
    adaptation[dim] = !hasTiming && DELIVERY_ONLY_DIMENSIONS.includes(dim)
      ? { score: null, turnRefs: [], rationale: 'Not observable: speed and tone of delivery cannot be judged from a text transcript.' }
      : g
  }
  // Composite score is computed HERE, deterministically, from the grounded
  // per-dimension scores — never trusted as a number the model invents —
  // same "server derives, never trusts the model blindly" rule as the
  // critical-moment grounding below.
  const presentScores = ADAPTATION_DIMENSIONS
    .map(dim => adaptation[dim].score)
    .filter((s): s is number => s != null)
  const adaptationScore = presentScores.length
    ? Math.round(presentScores.reduce((sum, s) => sum + s, 0) / presentScores.length) : null
  const adaptationRecommendation = typeof raw.adaptationRecommendation === 'string' ? raw.adaptationRecommendation : ''

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

  const pressureShiftInsight = typeof raw.pressureShiftInsight === 'string' ? raw.pressureShiftInsight : ''

  return { competencies, adaptation, adaptationScore, adaptationRecommendation, criticalMoments, pressureShiftInsight }
}
