import type { CoachingRecommendation } from '@/schemas/coaching'
import type { LearningObjective } from '@/schemas/session'
import type { CoachCandidate } from './select'

const MAX_FIELD_CHARS = 700

/** The coach must not score. Catches numeric performance talk the prompt bans:
 * "score/rating/grade" words, "7/10", "60/100", and any percentage (which
 * would also be an invented statistic in a sample response). */
const SCORE_TALK_RE = /\b(scores?|scored|rating|rated|grade[sd]?)\b|\b\d+(\.\d+)?\s*\/\s*(10|100)\b|\d+(\.\d+)?\s*%/i

export function mentionsScore(text: string): boolean {
  return SCORE_TALK_RE.test(text)
}

export function extractJson(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

const TEXT_FIELDS = ['whatHappened', 'whyItMattered', 'whatToDoDifferently', 'betterResponseExample', 'practiceAction'] as const

export interface CoachGroundResult { coaching: CoachingRecommendation[]; dropped: number }

/** Merges model text onto the app-chosen candidates. Competency, behavior,
 * evidence, kind and priority always come from the candidate; a point whose
 * text is missing, oversized, or talks about scores is dropped. */
export function groundCoaching(
  parsed: unknown, candidates: CoachCandidate[], objectives: LearningObjective[],
): CoachGroundResult | null {
  if (!parsed || typeof parsed !== 'object') return null
  const list = (parsed as Record<string, unknown>).points
  if (!Array.isArray(list)) return null

  const byRef = new Map(candidates.map(c => [c.ref, c]))
  const objectiveIds = new Set(objectives.map(o => o.id))
  const used = new Set<string>()
  const out: CoachingRecommendation[] = []
  let dropped = 0

  for (const item of list) {
    const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const candidate = typeof p.ref === 'string' ? byRef.get(p.ref) : undefined
    if (!candidate || used.has(candidate.ref)) { dropped++; continue }

    const text = {} as Record<typeof TEXT_FIELDS[number], string>
    let ok = true
    for (const f of TEXT_FIELDS) {
      const v = typeof p[f] === 'string' ? (p[f] as string).trim() : ''
      if (!v || v.length > MAX_FIELD_CHARS || mentionsScore(v)) { ok = false; break }
      text[f] = v
    }
    if (!ok) { dropped++; continue }

    used.add(candidate.ref)
    out.push({
      id: `coach-${candidate.ref}`,
      priority: 0,
      kind: candidate.kind,
      competency: candidate.competency,
      behavior: candidate.behavior,
      ...text,
      evidence: candidate.evidence,
      objectiveId: typeof p.objectiveId === 'string' && objectiveIds.has(p.objectiveId) ? p.objectiveId : null,
    })
  }

  // Priority follows the app's candidate order, whatever order the model used.
  const order = new Map(candidates.map((c, i) => [`coach-${c.ref}`, i + 1]))
  out.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  out.forEach((r, i) => { r.priority = i + 1 })
  return { coaching: out, dropped }
}
