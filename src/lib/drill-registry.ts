import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import {
  validateDrillTemplate, type DrillAttempt, type DrillDifficulty, type DrillTemplate, type DrillType,
} from '@/schemas/drill'
import type { StyleKey } from '@/types/game'

export interface DrillRegistry {
  get(id: string): DrillTemplate | undefined
  list(filter?: { type?: DrillType; lang?: 'en' | 'ar'; difficulty?: DrillDifficulty; physicianStyle?: StyleKey }): DrillTemplate[]
}

/** Builds a registry from raw template objects. Throws (at startup, with every
 * problem listed) rather than letting a malformed drill reach a rep. */
export function createDrillRegistry(raw: readonly unknown[]): DrillRegistry {
  const byId = new Map<string, DrillTemplate>()
  const problems: string[] = []
  raw.forEach((item, i) => {
    const res = validateDrillTemplate(item)
    if (!res.ok) { problems.push(`template #${i}: ${res.errors.join('; ')}`); return }
    if (byId.has(res.value.id)) { problems.push(`template #${i}: duplicate id "${res.value.id}"`); return }
    byId.set(res.value.id, res.value)
  })
  if (problems.length) throw new Error(`Invalid drill templates:\n${problems.join('\n')}`)
  return {
    get: id => byId.get(id),
    list: (f = {}) => [...byId.values()].filter(t =>
      (!f.type || t.type === f.type) && (!f.lang || t.languages.includes(f.lang)) &&
      (!f.difficulty || t.difficulty === f.difficulty) && (!f.physicianStyle || t.physicianStyle === f.physicianStyle)),
  }
}

export interface DrillResult {
  /** 0-100, or null when the response could not be assessed (never guessed). */
  score: number | null
  passed: boolean
  met: string[]
  missed: string[]
}

/**
 * Deterministic drill scoring from behaviors the (evidence-grounded) analysis
 * found. A criterion on a positive behavior is met when observed; a criterion
 * on a negative behavior ("avoid premature_pitch") is met when NOT observed.
 * `observed === null` means the response could not be assessed.
 */
export function scoreDrillResponse(t: DrillTemplate, observed: readonly string[] | null): DrillResult {
  if (observed === null) return { score: null, passed: false, met: [], missed: [] }
  const catalog = behaviorIndex(defaultScoringConfig)
  const seen = new Set(observed)
  let total = 0, got = 0
  const met: string[] = [], missed: string[] = []
  for (const c of t.criteria) {
    const negative = (catalog.get(c.behavior)?.rule.points ?? 1) < 0
    const ok = negative ? !seen.has(c.behavior) : seen.has(c.behavior)
    total += c.weight
    if (ok) { got += c.weight; met.push(c.behavior) } else missed.push(c.behavior)
  }
  const fraction = total > 0 ? got / total : 0
  const requiredOk = t.criteria.filter(c => c.required).every(c => met.includes(c.behavior))
  return { score: Math.round(fraction * 100), passed: requiredOk && fraction >= t.passMark, met, missed }
}

export interface DrillHistorySummary {
  attempts: number
  completions: number
  /** Best assessed score; null before any assessed attempt. */
  personalBest: number | null
  lastAttemptAt: string | null
}

/** Attempts for ONE drill (any order) -> history summary. A completion is a passed attempt. */
export function summarizeDrillHistory(attempts: readonly DrillAttempt[]): DrillHistorySummary {
  let best: number | null = null
  let last: string | null = null
  for (const a of attempts) {
    if (typeof a.score === 'number' && (best === null || a.score > best)) best = a.score
    if (last === null || a.at > last) last = a.at
  }
  return { attempts: attempts.length, completions: attempts.filter(a => a.passed).length, personalBest: best, lastAttemptAt: last }
}

/** Whether the rep may attempt again, and whether to show a hint on this attempt. */
export function retryState(t: DrillTemplate, attemptsSoFar: number): { canRetry: boolean; showHint: boolean } {
  return { canRetry: attemptsSoFar < t.retry.maxAttempts, showHint: attemptsSoFar >= t.retry.hintAfterAttempts }
}
