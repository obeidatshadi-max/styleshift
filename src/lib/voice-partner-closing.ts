import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type ClosingCriterion = 'summarized_agreement' | 'asked_commitment' | 'ends_on_question' | 'concise'
export const CLOSING_CRITERIA: readonly ClosingCriterion[] =
  ['summarized_agreement', 'asked_commitment', 'ends_on_question', 'concise']

export function isClosingCriterion(value: unknown): value is ClosingCriterion {
  return typeof value === 'string' && (CLOSING_CRITERIA as readonly string[]).includes(value)
}

export function buildClosingJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just delivered a closing statement to end the call:
"${statementText}"

Judge this closing against these criteria and give a short in-character reaction:
- "summarized_agreement": did it recap a specific point of agreement or interest that came up earlier (generic reference is fine — "what we discussed about your patients" — no invented clinical data)?
- "asked_commitment": did it ask one clear, specific closing question — a concrete next step (a trial, a follow-up visit, a decision by a stated point) rather than a vague "what do you think"?
- "ends_on_question": did the statement end on that commitment question, without the rep trying to keep talking after asking it (padding, re-justifying, or answering their own question instead of leaving room for a reply)?
- "concise": was it short and focused, not a rambling multi-point recap?

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken reaction, 1-2 sentences",
  "criteriaHit": ["summarized_agreement", "asked_commitment", "ends_on_question", "concise"]
}
"criteriaHit" = the subset of the four criteria above this statement satisfied — empty array if none.`
}

export function parseClosingJudgeResponse(text: string): { doctorText: string; criteriaHit: ClosingCriterion[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const criteriaHit: ClosingCriterion[] = Array.isArray(o.criteriaHit) ? o.criteriaHit.filter(isClosingCriterion) : []
  return { doctorText: o.doctorText, criteriaHit }
}
