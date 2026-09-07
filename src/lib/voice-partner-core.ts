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

export type ObjectionType = 'wrong_info' | 'doubt' | 'true_objection' | 'indifference' | 'false_objection'
export const OBJECTION_TYPES: readonly ObjectionType[] = ['wrong_info', 'doubt', 'true_objection', 'indifference', 'false_objection']

export function pickObjectionType(): ObjectionType {
  return OBJECTION_TYPES[Math.floor(Math.random() * OBJECTION_TYPES.length)]
}

export function isObjectionType(value: unknown): value is ObjectionType {
  return typeof value === 'string' && (OBJECTION_TYPES as readonly string[]).includes(value)
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

export function langName(lang: 'en' | 'ar'): string {
  return lang === 'ar' ? 'Arabic' : 'English'
}

/** The persona lines shared by the opening and judge prompts — same
 * key_phrases/objections/specialty inputs generate-scenario already assembles,
 * so the voice partner sounds like the rep's own Digital Twin doctor. */
export function personaLines(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const specialty = d.specialty ? `, ${d.specialty}` : ''
  const phrases = d.key_phrases?.trim() ? `They often say things like: "${d.key_phrases.trim()}".` : ''
  const objections = d.objections?.length ? `Objection theme(s) they are likely to raise: ${d.objections.join(', ')}.` : ''
  return `You are ${d.name}${specialty}, a ${style} customer (core drive: ${DRIVE[style]}). Write ALL text in ${langName(lang)}.
${phrases}
${objections}`
}

export function buildOpeningPrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, objectionType: ObjectionType,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

${objectionInstruction(objectionType)}

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
  turns: VoicePartnerTurn[], repReply: string, turnCount: number, objectionType: ObjectionType,
): string {
  const transcript = turns.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `${personaLines(doctor, style, lang)}
${historyContext}

${objectionInstruction(objectionType)}

Conversation so far:
${transcript || '(this is the opening line — the rep has not spoken yet)'}
Rep: ${repReply}

This is rep reply #${turnCount} of a maximum ${TURN_CAP}. Judge this reply and respond as the doctor.

Also identify which of the CLEAR objection-handling steps the rep's reply demonstrated, if any:
- "clarify": asked an open-ended question to understand your concern better
- "listen": paraphrased, reflected back, or repeated the last few words of what you said
- "empathy": acknowledged how you feel or think about this
- "answer": gave a substantive response addressing the objection (in the way appropriate to its type)
- "recheck": asked whether their answer resolved your concern or if anything remains

Return JSON exactly in this shape:
{
  "verdict": "win" | "escalate" | "continue",
  "doctorReply": "your in-character spoken reply, 1-3 sentences",
  "clearSteps": ["clarify", "listen", "empathy", "answer", "recheck"]
}
"win" = the rep's reply resolves your objection convincingly, end the conversation satisfied.
"escalate" = the rep's reply is weak or off-target and you're done listening, end the conversation unsatisfied.
"continue" = the reply is reasonable but you still have more resistance to raise — keep pushing.
"clearSteps" = the subset of the five steps above this specific reply demonstrated — empty array if none.`
}

export function parseJudgeResponse(text: string): { verdict: VoicePartnerVerdict; doctorReply: string; clearSteps: ClearStep[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorReply !== 'string' || !o.doctorReply.trim()) return null
  if (o.verdict !== 'win' && o.verdict !== 'escalate' && o.verdict !== 'continue') return null
  const clearSteps: ClearStep[] = Array.isArray(o.clearSteps) ? o.clearSteps.filter(isClearStep) : []
  return { verdict: o.verdict, doctorReply: o.doctorReply, clearSteps }
}

/** Pure turn-cap enforcement: the model's own verdict wins/escalates the
 * session outright; a "continue" verdict is overridden to "escalated" once
 * turnCount has reached TURN_CAP, regardless of what the model said. */
export function resolveTurn(turnCount: number, verdict: VoicePartnerVerdict): TurnOutcome {
  if (verdict === 'win') return 'won'
  if (verdict === 'escalate') return 'escalated'
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
