export type SpsKey = 'go' | 'connect' | 'plan' | 'support'

// Option order is always A=go, B=connect, C=plan, D=support across every
// question in the source assessment (self/index.html) — this is what lets
// scoring be driven purely by "which option index was picked" per question.
const KEY_ORDER: SpsKey[] = ['go', 'connect', 'plan', 'support']

export interface SpsQuestionSpec {
  /** True for the 2 Compliance & Ethics questions, scored separately from style. */
  compliance: boolean
  /** Present only when `compliance` is true: risk value (0-2) for options A-D. */
  risks?: [number, number, number, number]
}

// 16 questions, index-aligned with SPS_QUESTIONS_EN / SPS_QUESTIONS_AR in
// sps-data.ts / sps-data-ar.ts (which carry the display text for each index).
// Order: Selling Approach x2, Territory Management x2, Under Pressure x2,
// Scientific Knowledge x2, Teamwork x2, Customer Relationships x2,
// Compliance & Ethics x2, Mindset & Values x2 — same order as the source.
export const SPS_QUESTIONS: SpsQuestionSpec[] = [
  { compliance: false }, { compliance: false }, // Selling Approach
  { compliance: false }, { compliance: false }, // Territory Management
  { compliance: false }, { compliance: false }, // Under Pressure
  { compliance: false }, { compliance: false }, // Scientific Knowledge
  { compliance: false }, { compliance: false }, // Teamwork
  { compliance: false }, { compliance: false }, // Customer Relationships
  { compliance: true, risks: [2, 1, 0, 0] },     // Compliance & Ethics 1
  { compliance: true, risks: [2, 1, 0, 0] },     // Compliance & Ethics 2
  { compliance: false }, { compliance: false }, // Mindset & Values
]

// Diagonal-opposite quadrant on the Result/Process x Business/People grid.
export const SPS_OPPOSITE: Record<SpsKey, SpsKey> = {
  go: 'support', support: 'go', connect: 'plan', plan: 'connect',
}

export interface SpsResult {
  scores: Record<SpsKey, number>
  styleTotal: number
  topKey: SpsKey
  oppositeKey: SpsKey
  margin: number
  marginLevel: 'strong' | 'moderate' | 'flexible'
  balanced: boolean
  complianceRisk: number
  complianceMax: number
  complianceLevel: 'low' | 'moderate' | 'elevated'
  completedAt: string
}

/**
 * answers[i] = the option index (0-3, A-D) chosen for SPS_QUESTIONS[i].
 * Caller always supplies exactly 16 answers (the UI can't submit otherwise).
 */
export function scoreSps(answers: number[]): SpsResult {
  const scores: Record<SpsKey, number> = { go: 0, connect: 0, plan: 0, support: 0 }
  let styleTotal = 0
  let complianceRisk = 0
  let complianceMax = 0

  SPS_QUESTIONS.forEach((q, i) => {
    const pick = answers[i]
    if (q.compliance) {
      complianceRisk += q.risks![pick]
      complianceMax += 2
    } else {
      scores[KEY_ORDER[pick]]++
      styleTotal++
    }
  })

  const max = Math.max(...KEY_ORDER.map(k => scores[k]))
  const topKey = KEY_ORDER.find(k => scores[k] === max)!
  const sorted = KEY_ORDER.map(k => scores[k]).sort((a, b) => b - a)
  const margin = sorted[0] - sorted[1]
  const marginLevel = margin >= 5 ? 'strong' : margin >= 3 ? 'moderate' : 'flexible'
  const balanced = sorted[0] - sorted[3] <= 3
  const complianceLevel = complianceRisk === 0 ? 'low' : complianceRisk <= 2 ? 'moderate' : 'elevated'

  return {
    scores, styleTotal, topKey, oppositeKey: SPS_OPPOSITE[topKey],
    margin, marginLevel, balanced,
    complianceRisk, complianceMax, complianceLevel,
    completedAt: new Date().toISOString(),
  }
}
