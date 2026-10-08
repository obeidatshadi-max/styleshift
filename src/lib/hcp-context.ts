import type { Doctor, DoctorVisit } from '@/types/game'

/**
 * "Practice my doctor": a context-informed simulation of the LIKELY interaction.
 * It is not a model of the real person. Everything below keeps three kinds of
 * statement apart, and the simulation is told which is which:
 *
 *   facts       what the rep themselves recorded (verbatim, with where it came from)
 *   inferences  hedged readings of those facts, each pointing at the facts behind it
 *   challenges  invented for practice; explicitly NOT recorded about this doctor
 *
 * Only the rep's own records are used. Nothing here is verified by anyone else.
 */

export type FactKind =
  | 'specialty' | 'doctor_style' | 'hidden_concern' | 'plan_goal' | 'plan_measure' | 'objection_profile'
  | 'objection_visit' | 'last_contact' | 'promise_open' | 'what_worked' | 'next_action' | 'meeting_stage' | 'product_context' | 'key_phrases'

export interface HcpFact {
  id: string
  kind: FactKind
  /** Verbatim from the rep's record, clipped. */
  text: string
  /** When it was recorded; null for profile fields. */
  recordedAt: string | null
  source: 'profile' | 'visit' | 'debrief'
}

export type InferenceKind = 'objection_again' | 'promise_check' | 'worked_before' | 'long_gap'

export interface HcpInference {
  id: string
  kind: InferenceKind
  /** Text/number the sentence is built around (from the facts it rests on). */
  subject: string | null
  /** Facts this rests on. An inference with no basis is never produced. */
  basis: string[]
  certainty: 'inferred'
}

export const CHALLENGE_IDS = ['short_time', 'new_competitor', 'vague_objection', 'interrupted'] as const
export type ChallengeId = typeof CHALLENGE_IDS[number]

export type MissingCode = 'no_visits' | 'no_objections' | 'no_plan' | 'no_style'

export interface HcpContext {
  doctorId: string
  facts: HcpFact[]
  inferences: HcpInference[]
  challenge: ChallengeId
  missing: MissingCode[]
}

export interface DebriefLite { id: string; created_at: string; nextAction: string; visitDate?: string | null }

const FACT_MAX_CHARS = 200
const DAY_MS = 86_400_000
const LONG_GAP_DAYS = 30
/** Max visits read, newest first: older history is less likely to describe the next visit. */
const MAX_VISITS = 8

/** Single line, clipped: rep-written text is untrusted data when it reaches a prompt. */
export function clipFact(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, FACT_MAX_CHARS)
}

/** Deterministic: the same seed always picks the same challenge. */
export function pickChallenge(seed: string): ChallengeId {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  return CHALLENGE_IDS[(h >>> 0) % CHALLENGE_IDS.length]
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

export function buildHcpContext(
  doctor: Pick<Doctor, 'id' | 'specialty' | 'style' | 'key_phrases' | 'objections' | 'hidden_concern' | 'product_context' | 'meeting_stage' | 'plan_objective' | 'plan_success_measure'>,
  visits: readonly Pick<DoctorVisit, 'id' | 'source' | 'objection_raised' | 'promise_made' | 'what_worked' | 'promise_done_at' | 'is_contact' | 'contact_at' | 'created_at' | 'note'>[],
  debriefs: readonly DebriefLite[],
  seed: string,
  nowMs: number,
): HcpContext {
  const facts: HcpFact[] = []
  const add = (id: string, kind: FactKind, text: string | null | undefined, source: HcpFact['source'], recordedAt: string | null = null) => {
    const clean = text ? clipFact(text) : ''
    if (clean) facts.push({ id, kind, text: clean, recordedAt, source })
  }

  add('p:specialty', 'specialty', doctor.specialty, 'profile')
  add('p:style', 'doctor_style', doctor.style, 'profile')
  add('p:hidden', 'hidden_concern', doctor.hidden_concern, 'profile')
  add('p:goal', 'plan_goal', doctor.plan_objective, 'profile')
  add('p:measure', 'plan_measure', doctor.plan_success_measure, 'profile')
  add('p:stage', 'meeting_stage', doctor.meeting_stage, 'profile')
  add('p:product', 'product_context', doctor.product_context, 'profile')
  add('p:phrases', 'key_phrases', doctor.key_phrases, 'profile')
  ;(doctor.objections ?? []).slice(0, 5).forEach((o, i) => add(`p:objection:${i}`, 'objection_profile', o, 'profile'))

  // Real contacts only: practice sessions and coach-created tasks are not visits with this doctor.
  const real = visits
    .filter(v => v.source === 'manual' && v.is_contact !== false && v.note !== 'From a coach debrief')
    .sort((a, b) => Date.parse(b.contact_at ?? b.created_at) - Date.parse(a.contact_at ?? a.created_at))
    .slice(0, MAX_VISITS)
  if (real[0]) add(`v:${real[0].id}:contact`, 'last_contact', `Last visit was on ${(real[0].contact_at ?? real[0].created_at).slice(0, 10)}`, 'visit', real[0].contact_at ?? real[0].created_at)
  for (const v of real) {
    const at = v.contact_at ?? v.created_at
    add(`v:${v.id}:objection`, 'objection_visit', v.objection_raised, 'visit', at)
    add(`v:${v.id}:worked`, 'what_worked', v.what_worked, 'visit', at)
  }
  // An open promise is a fact whenever it was made, even in an auto-logged row.
  for (const v of visits.filter(x => x.promise_made?.trim() && !x.promise_done_at)) {
    add(`v:${v.id}:promise`, 'promise_open', v.promise_made, 'visit', v.created_at)
  }
  const lastDebrief = [...debriefs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  if (lastDebrief) add(`d:${lastDebrief.id}`, 'next_action', lastDebrief.nextAction, 'debrief', lastDebrief.created_at)

  const inferences: HcpInference[] = []
  const infer = (kind: InferenceKind, subject: string | null, basis: string[]) => {
    if (basis.length) inferences.push({ id: `i:${kind}:${basis[0]}`, kind, subject, basis, certainty: 'inferred' })
  }

  // The same objection recorded on more than one visit is the strongest basis available.
  const objectionFacts = facts.filter(f => f.kind === 'objection_visit')
  const seen = new Map<string, HcpFact[]>()
  for (const f of objectionFacts) seen.set(normalize(f.text), [...(seen.get(normalize(f.text)) ?? []), f])
  const recurring = [...seen.values()].sort((a, b) => b.length - a.length)[0]
  const latestObjection = objectionFacts[0]
  const chosen = recurring && recurring.length > 1 ? recurring : latestObjection ? [latestObjection] : []
  if (chosen.length) infer('objection_again', chosen[0].text, chosen.map(f => f.id))

  const promise = facts.filter(f => f.kind === 'promise_open').sort((a, b) => Date.parse(a.recordedAt ?? '') - Date.parse(b.recordedAt ?? ''))[0]
  if (promise) infer('promise_check', promise.text, [promise.id])

  const worked = facts.find(f => f.kind === 'what_worked')
  if (worked) infer('worked_before', worked.text, [worked.id])

  const lastContact = real[0] ? Date.parse(real[0].contact_at ?? real[0].created_at) : NaN
  if (Number.isFinite(lastContact) && (nowMs - lastContact) / DAY_MS >= LONG_GAP_DAYS) {
    infer('long_gap', String(Math.floor((nowMs - lastContact) / DAY_MS)), [`v:${real[0].id}:contact`])
  }

  const missing: MissingCode[] = []
  if (!real.length) missing.push('no_visits')
  if (!facts.some(f => f.kind === 'objection_visit' || f.kind === 'objection_profile')) missing.push('no_objections')
  if (!facts.some(f => f.kind === 'plan_goal' || f.kind === 'next_action')) missing.push('no_plan')
  if (!doctor.style) missing.push('no_style')

  return { doctorId: doctor.id, facts, inferences, challenge: pickChallenge(`${seed}:${doctor.id}`), missing }
}

/** Facts the rep chose not to use in this practice, removed along with any inference that rested on them. */
export function withoutFacts(ctx: HcpContext, excludedIds: readonly string[]): HcpContext {
  const out = new Set(excludedIds)
  return {
    ...ctx,
    facts: ctx.facts.filter(f => !out.has(f.id)),
    inferences: ctx.inferences.filter(i => i.basis.every(b => !out.has(b))),
  }
}

export function inferenceEnglish(i: HcpInference): string {
  switch (i.kind) {
    case 'objection_again': return `May raise this concern again: "${i.subject}".`
    case 'promise_check': return `May ask whether this was done: "${i.subject}".`
    case 'worked_before': return `May respond again to what worked before: "${i.subject}".`
    case 'long_gap': return `After about ${i.subject} days without contact, may want a clear reason for the visit.`
  }
}

export const CHALLENGE_ENGLISH: Record<ChallengeId, string> = {
  short_time: 'You have much less time than planned and say so early in the visit.',
  new_competitor: 'You mention a competing option the rep did not expect.',
  vague_objection: 'You raise a vague concern that the rep has to explore to understand.',
  interrupted: 'You are interrupted once during the visit and need the rep to get back to the point.',
}

/**
 * The block added to the doctor agent's persona background. The wording tells
 * the model what is history, what is only a tendency, and what is invented
 * for practice, and forbids remembering anything beyond the list.
 */
export function contextPromptBlock(ctx: HcpContext): string {
  const q = (s: string) => JSON.stringify(s)
  const lines: string[] = []
  const history = ctx.facts.filter(f => f.source !== 'profile' || f.kind === 'hidden_concern' || f.kind === 'plan_goal')
  if (history.length) lines.push(`Recorded by the rep (things that happened or were noted; treat as true): ${history.map(f => q(f.text)).join('; ')}.`)
  if (ctx.inferences.length) lines.push(`Possible tendencies (inferred from that record, NOT certain: you may show them fully, partly or not at all, and never describe them as established facts about yourself): ${ctx.inferences.map(i => q(inferenceEnglish(i))).join('; ')}.`)
  lines.push(`Practice challenge for this session (invented for practice, not recorded about you): ${CHALLENGE_ENGLISH[ctx.challenge]}`)
  lines.push('Do not claim to remember any earlier visit, promise, study or conversation that is not listed above.')
  return lines.join(' ')
}
