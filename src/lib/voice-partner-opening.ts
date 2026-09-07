import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type OpeningCriterion = 'problem_led' | 'relevant' | 'solution_linked' | 'concise'
export const OPENING_CRITERIA: readonly OpeningCriterion[] = ['problem_led', 'relevant', 'solution_linked', 'concise']

export function isOpeningCriterion(value: unknown): value is OpeningCriterion {
  return typeof value === 'string' && (OPENING_CRITERIA as readonly string[]).includes(value)
}

export function buildOpeningJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just delivered their opening statement to start the call:
"${statementText}"

Judge this opening statement against these criteria and give a short in-character reaction:
- "problem_led": did it open with a specific patient or clinical problem/challenge (not generic small talk, not a product pitch)?
- "relevant": is that problem one this doctor's patient type would plausibly face, given their specialty?
- "solution_linked": did it connect the problem to "your product" as the solution, without inventing clinical data (generic references like "the evidence pack" are fine, specific numbers or claims are not)?
- "concise": was it a short, focused statement (about 40 seconds spoken, not a long multi-point pitch)?

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken reaction, 1-2 sentences",
  "criteriaHit": ["problem_led", "relevant", "solution_linked", "concise"]
}
"criteriaHit" = the subset of the four criteria above this statement satisfied — empty array if none.`
}

export function parseOpeningJudgeResponse(text: string): { doctorText: string; criteriaHit: OpeningCriterion[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const criteriaHit: OpeningCriterion[] = Array.isArray(o.criteriaHit) ? o.criteriaHit.filter(isOpeningCriterion) : []
  return { doctorText: o.doctorText, criteriaHit }
}
