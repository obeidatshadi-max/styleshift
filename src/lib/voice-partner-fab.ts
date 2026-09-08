import type { Doctor, StyleKey } from '@/types/game'
import { personaLines } from '@/lib/voice-partner-core'

export type FabCriterion = 'feature_stated' | 'benefit_linked' | 'tailored' | 'patient_centered'
export const FAB_CRITERIA: readonly FabCriterion[] =
  ['feature_stated', 'benefit_linked', 'tailored', 'patient_centered']

export function isFabCriterion(value: unknown): value is FabCriterion {
  return typeof value === 'string' && (FAB_CRITERIA as readonly string[]).includes(value)
}

export function buildFabJudgePrompt(
  doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', historyContext: string, statementText: string,
): string {
  return `${personaLines(doctor, style, lang)}
${historyContext}

The rep has just delivered a features-and-benefits statement about their product:
"${statementText}"

Judge this statement against these criteria and give a short in-character reaction:
- "feature_stated": did it name a concrete product feature or characteristic (generic — "your product's formulation", "the delivery mechanism" — never an invented or branded drug name, never a specific clinical claim or statistic)?
- "benefit_linked": did it connect that feature to an outcome or benefit, rather than just restating the feature in different words?
- "tailored": did it tie the benefit to this doctor's patient type or need, given their specialty and any visit history above?
- "patient_centered": did it frame the benefit around the patient, rather than solely around the rep's or company's interest?

Return JSON exactly in this shape:
{
  "doctorText": "your in-character spoken reaction, 1-2 sentences",
  "criteriaHit": ["feature_stated", "benefit_linked", "tailored", "patient_centered"]
}
"criteriaHit" = the subset of the four criteria above this statement satisfied — empty array if none.`
}

export function parseFabJudgeResponse(text: string): { doctorText: string; criteriaHit: FabCriterion[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.doctorText !== 'string' || !o.doctorText.trim()) return null
  const criteriaHit: FabCriterion[] = Array.isArray(o.criteriaHit) ? o.criteriaHit.filter(isFabCriterion) : []
  return { doctorText: o.doctorText, criteriaHit }
}
