import type { Doctor, StyleKey, Specialty } from '@/types/game'
import { DRIVE } from '@/lib/doctor-context'
import { SPECIALTIES, SPECIALTY_ORDER } from '@/lib/game-data'

export const TURN_CAP = 5

export type VoicePartnerTurn = { role: 'doctor' | 'rep'; text: string }
export type TurnOutcome = 'continue' | 'won' | 'escalated'

// Hard guardrail shared by both the opening line and every judged reply —
// same rules as generate-scenario's SYSTEM prompt, extended for a
// multi-turn in-character conversation instead of a single scenario.
export const SYSTEM = `You are role-playing as a pharmaceutical doctor/customer during a sales rep's practice conversation. The rep is training to adapt their SOCIAL STYLE communication (Driver, Expressive, Amiable, Analytical) to this doctor's style.

Hard rules — follow exactly:
- NEVER invent clinical data, efficacy numbers, statistics, trial results, study names, dosages, or real/branded drug names.
- Refer to the product only as "your product"; refer to evidence generically ("the trial data", "the evidence pack", "the safety profile").
- Every reply must stay in character as the doctor — never break character to explain scoring or coach the rep directly.
- Any internal state or numbers described below are for YOU to feel, never to say, name, or hint at — never mention "trust", "skepticism", "engagement", "time pressure", or any number.
- React the way this specific doctor, in this specific state, would actually react — don't concede to a weak reply, don't stonewall a strong one.
- Output ONLY a single valid JSON object. No markdown fences, no commentary.`

export type ObjectionType = 'wrong_info' | 'doubt' | 'true_objection' | 'indifference' | 'false_objection'
export const OBJECTION_TYPES: readonly ObjectionType[] = ['wrong_info', 'doubt', 'true_objection', 'indifference', 'false_objection']

export function isObjectionType(value: unknown): value is ObjectionType {
  return typeof value === 'string' && (OBJECTION_TYPES as readonly string[]).includes(value)
}

/** One past voice-partner session's outcome for this doctor, the signal
 * `pickObjectionType` weights against. `voice_partner_sessions` is the only
 * table that stores objection type + outcome together (`doctor_visits`
 * only logs free-text) so callers should query that table for this. */
export interface ObjectionOutcome { objectionType: ObjectionType; outcome: 'won' | 'escalated' }

/** Uniform base weight per type, halved (floor 0.15) each time the rep has
 * already WON against that type recently for this doctor — favors a type
 * the rep hasn't yet resolved over one they've already demonstrated mastery
 * of, without ever fully excluding a type (still testable for regression). */
export function computeObjectionWeights(recent: ObjectionOutcome[] = []): Record<ObjectionType, number> {
  const weights: Record<ObjectionType, number> = {
    wrong_info: 1, doubt: 1, true_objection: 1, indifference: 1, false_objection: 1,
  }
  for (const { objectionType, outcome } of recent) {
    if (outcome === 'won') weights[objectionType] = Math.max(weights[objectionType] - 0.6, 0.15)
  }
  return weights
}

/** Weighted-random pick (see `computeObjectionWeights`); pass the doctor's
 * recent voice-partner outcomes to steer away from already-resolved types,
 * or omit for the original uniform-random behavior. */
export function pickObjectionType(recent: ObjectionOutcome[] = []): ObjectionType {
  const weights = computeObjectionWeights(recent)
  const total = OBJECTION_TYPES.reduce((sum, t) => sum + weights[t], 0)
  let roll = Math.random() * total
  for (const type of OBJECTION_TYPES) {
    roll -= weights[type]
    if (roll <= 0) return type
  }
  return OBJECTION_TYPES[OBJECTION_TYPES.length - 1]
}

export type ClearStep = 'clarify' | 'listen' | 'empathy' | 'answer' | 'recheck'
export const CLEAR_STEPS: readonly ClearStep[] = ['clarify', 'listen', 'empathy', 'answer', 'recheck']

export function isClearStep(value: unknown): value is ClearStep {
  return typeof value === 'string' && (CLEAR_STEPS as readonly string[]).includes(value)
}

/** What each objection type should feel like from the doctor's side, and how
 * the rep is meant to handle it — injected into both the opening and judge
 * prompts so the AI stays in character for the type across the whole session. */
const OBJECTION_INSTRUCTIONS: Record<ObjectionType, string> = {
  wrong_info: 'Your resistance is rooted in a mistaken belief you hold about "your product" — keep it a vague misconception (e.g. about how or for whom it is used), never a specific fabricated fact. The rep is meant to correct your misunderstanding diplomatically, pointing you to generic evidence ("the trial data", "the evidence pack") rather than inventing data of their own — reward that kind of correction.',
  doubt: 'Your resistance is skepticism about whether "your product" really works or is safe — you are not convinced, but you have not made up your mind against it either. The rep is meant to answer your doubt with third-party evidence (referred to generically, e.g. "the evidence pack" or "the trial data") — reward that more than a bare reassurance with no reference to evidence.',
  true_objection: 'Your resistance is a real, legitimate concern (for example, a side-effect or practical concern already reflected in your persona) — this is not a misunderstanding. The rep is meant to normalize and generalize it, acknowledging it is a known and manageable concern rather than dismissing or minimizing it — reward that, and stay resistant to a reply that brushes past your concern.',
  indifference: 'Show low engagement rather than a sharp objection — mild dismissiveness, a "not interested right now," or a shrug. You are hiding a real underlying concern that you will not volunteer. Only warm up if the rep asks genuine open-ended questions that draw out what is actually on your mind — a generic pitch or a closed yes/no question should not move you.',
  false_objection: 'State a reason that is not a real reason — a stated excuse you reach for reflexively rather than something you actually believe or care about (distinct from indifference, which is low engagement with no stated reason at all; here you DO state a reason, it just is not your true one). Do not defend this stated reason hard if challenged directly — it should feel thin. The rep is meant to stay patient, not argue the stated reason, and ask questions to surface what is actually behind it — reward that patience and curiosity over a rep who takes the stated reason at face value and tries to counter it directly.',
}

function objectionInstruction(type: ObjectionType): string {
  return OBJECTION_INSTRUCTIONS[type]
}

/** Domain of plausible concern categories per specialty — steers WHICH
 * generic categories the model reaches for, never specific facts; the
 * SYSTEM guardrail's ban on invented clinical data/statistics still
 * applies in full. */
export const SPECIALTY_CONTEXT: Record<Specialty, string> = {
  cardiology: 'Concerns in this domain typically center on cardiovascular risk profile, drug-drug interactions with other cardiac medications, and long-term safety — draw on these domains generically, never invented statistics.',
  endocrinology: 'Concerns in this domain typically center on adherence over chronic long-term use, monitoring burden, and interactions with comorbid conditions.',
  oncology: 'Concerns in this domain typically center on efficacy versus quality-of-life trade-offs, treatment burden, and how this fits alongside other therapies.',
  pediatrics: 'Concerns in this domain typically center on dosing across different ages/weights, compliance and palatability for children, and burden on caregivers.',
  general_practice: 'You are a generalist gatekeeper, not a narrow specialist — concerns are broad: does this fit a wide range of patients, referral thresholds, and time pressure in a busy practice.',
  dermatology: 'Concerns in this domain typically center on visible side effects, treatment duration, and cosmetic tolerance.',
  respiratory: 'Concerns in this domain typically center on inhaler/device technique, exacerbation history, and comorbid conditions.',
  psychiatry_neurology: 'Concerns in this domain typically center on adherence and stigma, titration/onset concerns, and cognitive or sedative side effects.',
}

export function isSpecialty(value: unknown): value is Specialty {
  return typeof value === 'string' && (SPECIALTY_ORDER as readonly string[]).includes(value)
}

export function langName(lang: 'en' | 'ar'): string {
  return lang === 'ar' ? 'Arabic' : 'English'
}

// ───────────────────────── Weighted persona (1.4) ─────────────────────────

interface StyleWeights { driver: number; expressive: number; amiable: number; analytical: number }

/** Reads the doctor's four nullable weight columns; returns null (→ legacy
 * single-style behavior) unless at least one is set. */
function styleWeights(d: Doctor): StyleWeights | null {
  if (d.style_driver == null && d.style_expressive == null && d.style_amiable == null && d.style_analytical == null) return null
  return {
    driver: d.style_driver ?? 0,
    expressive: d.style_expressive ?? 0,
    amiable: d.style_amiable ?? 0,
    analytical: d.style_analytical ?? 0,
  }
}

function styleDescriptor(weights: StyleWeights | null, style: StyleKey): string {
  if (!weights) return `a ${style} customer (core drive: ${DRIVE[style]})`
  const total = weights.driver + weights.expressive + weights.amiable + weights.analytical
  if (total <= 0) return `a ${style} customer (core drive: ${DRIVE[style]})`
  const blend = (Object.keys(weights) as StyleKey[])
    .map(k => ({ k, pct: Math.round((weights[k] / total) * 100) }))
    .filter(p => p.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map(p => `${p.pct}% ${p.k} (${DRIVE[p.k]})`)
    .join(', ')
  return `primarily a ${style} customer in this moment, with a persistent underlying blend of ${blend} — let the secondary styles surface as brief shifts in tone or emphasis, never as a different personality`
}

// ───────────────────────── Hidden concerns (1.5) ─────────────────────────

function hiddenConcernLine(d: Doctor): string {
  const concern = d.hidden_concern?.trim()
  if (!concern) return ''
  return `\nYou privately have this underlying concern, which you must NEVER state directly or hint at explicitly unless the reveal instruction below tells you to: "${concern}"`
}

/** Only when the rep has already earned a "clarify" CLEAR step this session
 * — reuses the existing CLEAR vocabulary rather than a new discovery
 * mechanic. Reveal is a hint, not a confession. */
function hiddenConcernRevealLine(d: Doctor, clarifyUnlocked: boolean): string {
  if (!d.hidden_concern?.trim() || !clarifyUnlocked) return ''
  return '\nThe rep just asked a genuinely good open diagnostic question — as a reward, let a little of your true underlying concern (stated above, privately) color this reply. Hint at it, do not state it outright.'
}

// ───────────────────────── Scenario context (1.8) ─────────────────────────

function scenarioContextLine(d: Doctor): string {
  const parts: string[] = []
  if (d.product_context?.trim()) parts.push(`Product/context: ${d.product_context.trim()}.`)
  if (d.meeting_stage?.trim()) parts.push(`Meeting stage: ${d.meeting_stage.trim()}.`)
  if (typeof d.available_time_min === 'number' && d.available_time_min > 0) {
    parts.push(`You have about ${d.available_time_min} minutes for this meeting — let realistic time pressure show if the rep is slow to get to the point.`)
  }
  return parts.length ? `\n${parts.join(' ')}` : ''
}

// ───────────────────────── Physician state engine (1.3) ─────────────────────────

export interface PhysicianState { trust: number; skepticism: number; engagement: number; timePressure: number }
export interface StateDelta { trustDelta: number; skepticismDelta: number; engagementDelta: number }

export type Difficulty = 'supportive' | 'realistic' | 'resistant' | 'pressure_test'
export const DIFFICULTY_LEVELS: readonly Difficulty[] = ['supportive', 'realistic', 'resistant', 'pressure_test']
export const DEFAULT_DIFFICULTY: Difficulty = 'realistic'

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTY_LEVELS as readonly string[]).includes(value)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** Starting-state shift per difficulty — structural (changes what the
 * physician actually feels at turn 1), not a tone instruction to "be ruder".
 * `timePressure` is an absolute seed (Phase 1 doesn't decay it turn-to-turn);
 * the others are deltas on top of the style-derived baseline. */
const DIFFICULTY_SEED: Record<Difficulty, { trustDelta: number; skepticismDelta: number; engagementDelta: number; timePressure: number }> = {
  supportive: { trustDelta: 15, skepticismDelta: -15, engagementDelta: 10, timePressure: 15 },
  realistic: { trustDelta: 0, skepticismDelta: 0, engagementDelta: 0, timePressure: 30 },
  resistant: { trustDelta: -15, skepticismDelta: 15, engagementDelta: -10, timePressure: 45 },
  pressure_test: { trustDelta: -25, skepticismDelta: 20, engagementDelta: -15, timePressure: 70 },
}

/** Seeds per-session physician state from the doctor's Social Style axes
 * (assertiveness/responsiveness) plus the chosen difficulty. In-memory only
 * for Phase 1 — the client carries it turn to turn (see turn/route.ts); a
 * snapshot is persisted per turn into `conversation_turns` for Phase 4. */
export function seedPhysicianState(doctor: Doctor, difficulty: Difficulty): PhysicianState {
  let trust = 50, skepticism = 50, engagement = 50
  if (doctor.assertiveness === 'tell') trust -= 10
  if (doctor.responsiveness === 'controls') skepticism += 10
  if (doctor.responsiveness === 'emotes') engagement += 10

  const seed = DIFFICULTY_SEED[difficulty]
  return {
    trust: clamp(trust + seed.trustDelta, 0, 100),
    skepticism: clamp(skepticism + seed.skepticismDelta, 0, 100),
    engagement: clamp(engagement + seed.engagementDelta, 0, 100),
    timePressure: seed.timePressure,
  }
}

/** Applies the model's per-turn state delta (each field clamped to -10..10
 * before it's added) to the carried-forward state, clamped to 0..100.
 * `timePressure` is untouched — Phase 1 only seeds it (see DIFFICULTY_SEED);
 * dynamic time-pressure updates are Phase 4+. */
export function applyStateDelta(state: PhysicianState, delta: StateDelta): PhysicianState {
  return {
    trust: clamp(state.trust + clamp(delta.trustDelta, -10, 10), 0, 100),
    skepticism: clamp(state.skepticism + clamp(delta.skepticismDelta, -10, 10), 0, 100),
    engagement: clamp(state.engagement + clamp(delta.engagementDelta, -10, 10), 0, 100),
    timePressure: state.timePressure,
  }
}

export function isPhysicianState(value: unknown): value is PhysicianState {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return ['trust', 'skepticism', 'engagement', 'timePressure'].every(
    k => typeof s[k] === 'number' && Number.isFinite(s[k] as number) && (s[k] as number) >= 0 && (s[k] as number) <= 100,
  )
}

/** Internal-only prompt block describing current state — never surfaced to
 * the rep; the SYSTEM guardrail also forbids naming these values directly. */
function stateInstructionBlock(state: PhysicianState): string {
  return `\nInternal state (never reveal these numbers or mention them — they only shape your tone): trust ${state.trust}/100, skepticism ${state.skepticism}/100, engagement ${state.engagement}/100, time pressure ${state.timePressure}/100. Lower trust → shorter, more guarded replies. Higher skepticism → demand more evidence before conceding. Lower engagement → terser, less curious. Higher time pressure → want to wrap up quickly, less patience for a long pitch.`
}

// ───────────────────────── Shared persona block ─────────────────────────

/** The persona lines shared by every voice-partner prompt (opening, judge,
 * and the opening/closing/fab/questioning sibling modes) — same
 * key_phrases/objections/specialty inputs generate-scenario already
 * assembles, so the voice partner sounds like the rep's own Digital Twin
 * doctor. Reads the Phase 1 weighted-persona/hidden-concern/scenario-context
 * columns straight off `d` when present; every existing call site keeps
 * working unchanged since the signature hasn't changed. */
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialtyLabel = d.specialty ? (isSpecialty(d.specialty) ? SPECIALTIES[d.specialty].name : d.specialty) : ''
  const specialty = specialtyLabel ? `, ${specialtyLabel}` : ''
  const domainFlavor = d.specialty && isSpecialty(d.specialty) ? SPECIALTY_CONTEXT[d.specialty] : ''
  const phrases = d.key_phrases?.trim() ? `They often say things like: "${d.key_phrases.trim()}".` : ''
  const objections = d.objections?.length ? `Objection theme(s) they are likely to raise: ${d.objections.join(', ')}.` : ''
  const descriptor = styleDescriptor(styleWeights(d), style)
  return `You are ${d.name}${specialty}, ${descriptor}. Write ALL text in ${langName(lang)}.
${domainFlavor}
${phrases}
${objections}${hiddenConcernLine(d)}${scenarioContextLine(d)}`
}

export function buildOpeningPrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, objectionType: ObjectionType,
  state?: PhysicianState,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

${objectionInstruction(objectionType)}
${state ? stateInstructionBlock(state) : ''}

Open the conversation with a short objection about "your product" — the opening resistance the rep needs to work through, in your own voice, 1-2 sentences.

Return JSON exactly in this shape:
{"doctorText": "your opening objection"}`
}

export function parseOpeningResponse(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  return o.doctorText
}

// ───────────────────────── DoctorAgent / observer split (1.2) ─────────────────────────

/** What the DOCTOR decides, in character — a persona/state reaction, never
 * a judgment of the rep's performance: "satisfied" (no longer needs to
 * press this concern), "disengaged" (done listening, unconvinced), or
 * "resistant" (still has more to raise). `resolveTurn` — a separate,
 * deterministic function — is what turns this into a pedagogical outcome. */
export type PersonaState = 'resistant' | 'satisfied' | 'disengaged'

export function buildJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string,
  turns: VoicePartnerTurn[], repReply: string, turnCount: number, objectionType: ObjectionType,
  state?: PhysicianState, clarifyUnlocked = false,
): string {
  const transcript = turns.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `${personaLines(doctor, style, lang)}
${historyContext}

${objectionInstruction(objectionType)}
${state ? stateInstructionBlock(state) : ''}${hiddenConcernRevealLine(doctor, clarifyUnlocked)}

Conversation so far:
${transcript || '(this is the opening line — the rep has not spoken yet)'}
Rep: ${repReply}

This is rep reply #${turnCount} of a maximum ${TURN_CAP}. React as the doctor would, in character, given your persona and internal state above.

Separately (as an objective observer, not a judgment of the rep), identify which of the CLEAR objection-handling steps the rep's reply demonstrated, if any:
- "clarify": asked an open-ended question to understand your concern better
- "listen": paraphrased, reflected back, or repeated the last few words of what you said
- "empathy": acknowledged how you feel or think about this
- "answer": gave a substantive response addressing the objection (in the way appropriate to its type)
- "recheck": asked whether their answer resolved your concern or if anything remains

Return JSON exactly in this shape:
{
  "personaState": "resistant" | "satisfied" | "disengaged",
  "doctorReply": "your in-character spoken reply, 1-3 sentences",
  "clearSteps": ["clarify", "listen", "empathy", "answer", "recheck"],
  "stateDelta": { "trustDelta": -10, "skepticismDelta": -10, "engagementDelta": -10 }
}
"satisfied" = in character, you no longer need to press this concern — convinced enough to move on positively.
"disengaged" = in character, you're done listening, unconvinced, and want to end the conversation.
"resistant" = in character, you still have more resistance to raise — keep pushing.
"clearSteps" = the subset of the five steps above this specific reply demonstrated — empty array if none.
"stateDelta" = how this reply shifted your trust/skepticism/engagement, each an integer from -10 to +10 (0 for no change).`
}

function parseStateDelta(raw: unknown): StateDelta {
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), -10, 10) : 0)
  const d = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return { trustDelta: num(d.trustDelta), skepticismDelta: num(d.skepticismDelta), engagementDelta: num(d.engagementDelta) }
}

export function parseJudgeResponse(text: string): { personaState: PersonaState; doctorReply: string; clearSteps: ClearStep[]; stateDelta: StateDelta } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorReply !== 'string' || !o.doctorReply.trim()) return null
  if (o.personaState !== 'resistant' && o.personaState !== 'satisfied' && o.personaState !== 'disengaged') return null
  const clearSteps: ClearStep[] = Array.isArray(o.clearSteps) ? o.clearSteps.filter(isClearStep) : []
  return { personaState: o.personaState, doctorReply: o.doctorReply, clearSteps, stateDelta: parseStateDelta(o.stateDelta) }
}

/** Pure turn-cap enforcement: the doctor's own in-character persona state
 * resolves the session outright on "satisfied"/"disengaged"; "resistant" is
 * overridden to "escalated" once turnCount has reached TURN_CAP, regardless
 * of the persona state. This is the deterministic, non-LLM step that turns
 * a persona/state reaction into a pedagogical outcome — the DoctorAgent
 * itself never decides "win" or "lose". */
export function resolveTurn(turnCount: number, personaState: PersonaState): TurnOutcome {
  if (personaState === 'satisfied') return 'won'
  if (personaState === 'disengaged') return 'escalated'
  return turnCount >= TURN_CAP ? 'escalated' : 'continue'
}

export async function transcribeAudio(audio: Blob, apiKey: string, lang: 'en' | 'ar'): Promise<string | null> {
  const form = new FormData()
  form.append('file', audio, 'turn.webm')
  form.append('model', 'whisper-1')
  // Pinning the language stops Whisper guessing (and mis-transcribing short
  // Arabic replies as another language) when the session is already known.
  form.append('language', lang === 'ar' ? 'ar' : 'en')
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch { return null }
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { text?: string } | null
  return data?.text?.trim() || null
}
