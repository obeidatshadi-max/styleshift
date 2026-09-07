import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type QuestionType = 'forbidden_reason' | 'forbidden_indication' | 'effective_challenges' | 'effective_criteria' | 'other'
export const QUESTION_TYPES: readonly QuestionType[] =
  ['forbidden_reason', 'forbidden_indication', 'effective_challenges', 'effective_criteria', 'other']

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value)
}

export type ListeningCue = 'restated' | 'paraphrased' | 'validatedFeelings'
export const LISTENING_CUES: readonly ListeningCue[] = ['restated', 'paraphrased', 'validatedFeelings']

export function isListeningCue(value: unknown): value is ListeningCue {
  return typeof value === 'string' && (LISTENING_CUES as readonly string[]).includes(value)
}

export function buildQuestionJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, questionText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just asked you this question, right after their opening statement:
"${questionText}"

Classify the question against these five types and answer it in character:
- "forbidden_reason": a leading question like "why are you prescribing what you currently prescribe?" — it makes you rehearse and reinforce your own existing reasons rather than opening anything new.
- "forbidden_indication": a question like "in this indication/these cases, what would you prescribe?" — it puts you on the spot about your own decision-making.
- "effective_challenges": an open question about what challenges or problems your patients in this area face.
- "effective_criteria": an open question about what criteria or factors you look for when choosing a medication in this situation.
- "other": anything that doesn't clearly fit one of the above (small talk, a closed yes/no question, an off-topic question).

Answer according to the type: for "forbidden_reason", confidently restate your own existing reasoning, unmoved. For "forbidden_indication", answer vaguely, sounding slightly put on the spot. For "effective_challenges", answer with a concrete patient need or challenge (generic, no invented clinical specifics). For "effective_criteria", answer with the actual selection factors you weigh. For "other", answer briefly and without much enthusiasm.

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken answer, 1-3 sentences",
  "questionType": "forbidden_reason" | "forbidden_indication" | "effective_challenges" | "effective_criteria" | "other"
}`
}

export function parseQuestionJudgeResponse(text: string): { doctorText: string; questionType: QuestionType } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  if (!isQuestionType(o.questionType)) return null
  return { doctorText: o.doctorText, questionType: o.questionType }
}

export function buildListeningJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string,
  questionText: string, doctorAnswer: string, questionType: QuestionType, repResponseText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

Earlier in this conversation:
Rep asked: "${questionText}"
You answered: "${doctorAnswer}"

The rep has now replied to your answer:
"${repResponseText}"

Judge this reply for active listening and give a short in-character close. Identify which of these techniques the rep's reply demonstrated:
- "restated": repeated back or restated what you said, including techniques like repeating your last few words.
- "paraphrased": reflected the meaning of what you said back in their own words (distinct from restating it verbatim).
- "validatedFeelings": acknowledged how you feel or think about this, not just what you said.

Return JSON exactly in this shape:
{
  "doctorText": "a short in-character close, 1-2 sentences — does the doctor feel heard or brushed past",
  "listeningCuesHit": ["restated", "paraphrased", "validatedFeelings"]
}
"listeningCuesHit" = the subset of the three techniques above this reply demonstrated — empty array if none.`
}

export function parseListeningJudgeResponse(text: string): { doctorText: string; listeningCuesHit: ListeningCue[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const listeningCuesHit: ListeningCue[] = Array.isArray(o.listeningCuesHit) ? o.listeningCuesHit.filter(isListeningCue) : []
  return { doctorText: o.doctorText, listeningCuesHit }
}
