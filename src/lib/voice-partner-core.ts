import type { Doctor, StyleKey } from '@/types/game'
import { DRIVE } from '@/lib/doctor-context'

export const TURN_CAP = 5

export type VoicePartnerTurn = { role: 'doctor' | 'rep'; text: string }
export type VoicePartnerVerdict = 'win' | 'escalate' | 'continue'
export type TurnOutcome = 'continue' | 'won' | 'escalated'

// Hard guardrail shared by both the opening line and every judged reply —
// same rules as generate-scenario's SYSTEM prompt, extended for a
// multi-turn in-character conversation instead of a single scenario.
export const SYSTEM = `You are role-playing as a pharmaceutical doctor/customer during a sales rep's practice conversation. The rep is training to adapt their SOCIAL STYLE communication (Driver, Expressive, Amiable, Analytical) to this doctor's style.

Hard rules — follow exactly:
- NEVER invent clinical data, efficacy numbers, statistics, trial results, study names, dosages, or real/branded drug names.
- Refer to the product only as "your product"; refer to evidence generically ("the trial data", "the evidence pack", "the safety profile").
- Every reply must stay in character as the doctor — never break character to explain scoring or coach the rep directly.
- Judge the rep's most recent reply on its own merits: adjust resistance based on argument quality — don't concede to a weak reply, don't stonewall a strong one.
- Output ONLY a single valid JSON object. No markdown fences, no commentary.`

function langName(lang: 'en' | 'ar'): string {
  return lang === 'ar' ? 'Arabic' : 'English'
}

/** The persona lines shared by the opening and judge prompts — same
 * key_phrases/objections/specialty inputs generate-scenario already assembles,
 * so the voice partner sounds like the rep's own Digital Twin doctor. */
function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialty = d.specialty ? `, ${d.specialty}` : ''
  const phrases = d.key_phrases?.trim() ? `They often say things like: "${d.key_phrases.trim()}".` : ''
  const objections = d.objections?.length ? `Objection theme(s) they are likely to raise: ${d.objections.join(', ')}.` : ''
  return `You are ${d.name}${specialty}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${phrases}
${objections}`
}

export function buildOpeningPrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

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

export function buildJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string,
  turns: VoicePartnerTurn[], repReply: string, turnCount: number,
): string {
  const transcript = turns.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `${personaLines(doctor, style, lang)}
${historyContext}

Conversation so far:
${transcript || '(this is the opening line — the rep has not spoken yet)'}
Rep: ${repReply}

This is rep reply #${turnCount} of a maximum ${TURN_CAP}. Judge this reply and respond as the doctor.

Return JSON exactly in this shape:
{
  "verdict": "win" | "escalate" | "continue",
  "doctorReply": "your in-character spoken reply, 1-3 sentences"
}
"win" = the rep's reply resolves your objection convincingly, end the conversation satisfied.
"escalate" = the rep's reply is weak or off-target and you're done listening, end the conversation unsatisfied.
"continue" = the reply is reasonable but you still have more resistance to raise — keep pushing.`
}

export function parseJudgeResponse(text: string): { verdict: VoicePartnerVerdict; doctorReply: string } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorReply !== 'string' || !o.doctorReply.trim()) return null
  if (o.verdict !== 'win' && o.verdict !== 'escalate' && o.verdict !== 'continue') return null
  return { verdict: o.verdict, doctorReply: o.doctorReply }
}

/** Pure turn-cap enforcement: the model's own verdict wins/escalates the
 * session outright; a "continue" verdict is overridden to "escalated" once
 * turnCount has reached TURN_CAP, regardless of what the model said. */
export function resolveTurn(turnCount: number, verdict: VoicePartnerVerdict): TurnOutcome {
  if (verdict === 'win') return 'won'
  if (verdict === 'escalate') return 'escalated'
  return turnCount >= TURN_CAP ? 'escalated' : 'continue'
}
