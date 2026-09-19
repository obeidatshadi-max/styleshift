import type { StyleKey } from '@/types/game'
import { SPECIALTIES } from '@/lib/game-data'
import { DRIVE } from '@/lib/doctor-context'
import {
  IRAQI_DIALECT_LINE, SPECIALTY_CONTEXT, langName, objectionInstruction, stateInstructionBlock,
  type PhysicianState,
} from '@/lib/voice-partner-core'
import type { StyleShiftSession } from '@/schemas/session'
import type { RepTurnShape } from './behavior'

/** Plain-text role-play guardrails. Unlike the live judge's SYSTEM (which
 * demands JSON with CLEAR-step scoring), this agent's ONLY job is to speak as
 * the physician: no scoring, no coaching, no verdicts. */
export const DOCTOR_SYSTEM = `You are role-playing as a pharmaceutical doctor/customer in a sales rep's practice conversation. Your ONLY job is to be that physician.

Hard rules — follow exactly:
- Stay in character as the doctor at all times. Never mention being an AI, a simulation, or a training exercise.
- Follow the persona and internal state below. Let them shape your tone, patience and what you ask.
- NEVER name, hint at, or describe your social style or personality type (Driver, Expressive, Amiable, Analytical, or any similar label). Show it only through how you talk.
- NEVER coach, advise, praise, criticise, or grade the rep. Never say whether an answer was good, bad, correct or effective. No feedback of any kind.
- NEVER score the rep or mention scores, steps, techniques or frameworks (including "CLEAR").
- NEVER invent clinical data, efficacy numbers, statistics, trial results, study names, dosages, or real/branded drug names. Refer to the product only as "your product" and to evidence generically ("the trial data", "the evidence pack", "the safety profile").
- Never mention "trust", "skepticism", "engagement", "time pressure" or any number from your internal state.
- Ask realistic questions a real doctor would ask, at most one or two per reply. Raise objections naturally in your own words, one at a time — never as a list.
- React the way THIS doctor in THIS state would. Do not concede to a weak reply and do not stonewall a strong one.
- Reply with ONLY the doctor's spoken words, 1-3 short sentences. No labels like "Doctor:", no quotation marks around the reply, no stage directions, no markdown.`

function styleFeel(session: StyleShiftSession): string {
  const { weights, source } = session.socialStyle
  const total = weights.driver + weights.expressive + weights.amiable + weights.analytical
  const keys = Object.keys(weights) as StyleKey[]
  if (source === 'unknown' || total <= 0) {
    return 'a professional with no strong, obvious communication style'
  }
  const blend = keys
    .map(k => ({ k, pct: Math.round((weights[k] / total) * 100) }))
    .filter(p => p.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map(p => `${p.pct}% ${DRIVE[p.k]}`)
    .join(', ')
  return `someone whose communication is driven by: ${blend}. Express this only through how you speak (pace, what you care about, what you ask) — never label it`
}

export function personaBlock(session: StyleShiftSession): string {
  const { physician, specialty, lang, objections, product } = session
  const specialtyLabel = specialty ? SPECIALTIES[specialty].name : ''
  const specialtyPart = specialtyLabel ? `, ${specialtyLabel}` : ''
  const domain = specialty ? SPECIALTY_CONTEXT[specialty] : ''
  const phrases = physician.keyPhrases?.trim() ? `You often say things like: "${physician.keyPhrases.trim()}".` : ''
  const onProfile = objections.onProfile.length ? `Objection theme(s) you are likely to raise: ${objections.onProfile.join(', ')}.` : ''
  const workplace = physician.workplace?.trim() ? ` You work at ${physician.workplace.trim()}.` : ''
  const languageLine = lang === 'ar' ? IRAQI_DIALECT_LINE : `Write ALL text in ${langName(lang)}.`
  const context: string[] = []
  if (product.context?.trim()) context.push(`Product/context: ${product.context.trim()}.`)
  if (physician.meetingStage?.trim()) context.push(`Meeting stage: ${physician.meetingStage.trim()}.`)
  if (physician.availableTimeMin && physician.availableTimeMin > 0) {
    context.push(`You have about ${physician.availableTimeMin} minutes — let realistic time pressure show if the rep is slow to get to the point.`)
  }
  const hidden = physician.hiddenConcern?.trim()
    ? `\nYou privately have this underlying concern, which you must NEVER state directly: "${physician.hiddenConcern.trim()}"`
    : ''
  return [
    `You are ${physician.name || 'a physician'}${specialtyPart}, ${styleFeel(session)}.${workplace} ${languageLine}`,
    domain, phrases, onProfile, context.join(' '), hidden,
  ].filter(Boolean).join('\n')
}

/** How the doctor reacts to the SHAPE of what the rep just did — phrased as a
 * felt reaction, never as feedback the doctor would voice. */
function reactionCue(shape: RepTurnShape): string {
  if (shape.words >= 130) return 'The rep just talked for a very long time without pausing. You are visibly losing patience: cut in, be much shorter, and show you are drifting.'
  if (shape.talkedTooLong) return 'The rep just gave a long speech. You are getting less engaged: keep it brief and a little impatient.'
  if (shape.askedOpenQuestion) return 'The rep just asked a genuine open question about you or your situation. You feel heard: warm up a little and answer more fully than you have so far.'
  if (shape.askedQuestion) return 'The rep asked a closed question. Answer it directly and briefly.'
  return 'The rep made a statement without asking about you. Stay as engaged as your state suggests, no more.'
}

export function buildDoctorReplyPrompt(
  session: StyleShiftSession, repText: string, shape: RepTurnShape, state: PhysicianState,
): string {
  const transcript = session.transcript
    .map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  const objection = session.objections.activeType ? `\n${objectionInstruction(session.objections.activeType)}` : ''
  const revealHidden = session.physician.hiddenConcern?.trim() && shape.askedOpenQuestion
    ? '\nThe rep asked a genuinely good open question — let a little of your private underlying concern color this reply. Hint at it, do not state it outright.'
    : ''
  return `${personaBlock(session)}${objection}
${stateInstructionBlock(state)}${revealHidden}

Conversation so far:
${transcript || '(nothing yet)'}
Rep: ${repText}

${reactionCue(shape)}

Reply now as the doctor — spoken words only.`
}

export function buildDoctorOpeningPrompt(session: StyleShiftSession, state: PhysicianState): string {
  const objection = session.objections.activeType
    ? objectionInstruction(session.objections.activeType)
    : 'Open with a short, natural hesitation about "your product".'
  return `${personaBlock(session)}
${objection}
${stateInstructionBlock(state)}

The rep has just walked in. Open the conversation as the doctor with a short objection or realistic question about "your product" — 1-2 sentences, spoken words only.`
}
