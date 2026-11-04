// Behavioral Improvement Engine - one metric catalogue for every practice source.
//
// Before this, AI-Doctor sessions (session_scorecards.signals) and recorded
// colleague roleplays (roleplay_sessions) each measured behaviour in their own
// units and keys, so nothing could compare across them. Every value here is
// normalised to a DISPLAY scale (0-100 for percentages) and carries a fixed
// direction and noise floor, so two sessions always compare the same way.

export const EVIDENCE_TIERS = ['observed_practice', 'self_reported', 'verified_field'] as const
/**
 * Where a piece of evidence came from. These are never merged into one number:
 * - observed_practice: measured by StyleShift from a practice conversation
 * - self_reported:     the rep says it happened in a real visit
 * - verified_field:    someone other than the rep confirmed it in the field
 */
export type EvidenceTier = typeof EVIDENCE_TIERS[number]

export const METRIC_KEYS = [
  'open_question_ratio', 'paraphrase_score', 'active_listening', 'talk_ratio',
  'adaptation_score', 'clear_steps_per_turn', 'drill_score',
] as const
export type MetricKey = typeof METRIC_KEYS[number]

export interface MetricDef {
  key: MetricKey
  /** Which way is better. talk_ratio is the one "lower" metric (rep should talk less). */
  direction: 'higher' | 'lower'
  /** Smallest movement, in display units, that counts as a real change rather than noise. */
  minDelta: number
  unit: 'percent' | 'points' | 'steps'
}

export const METRICS: Record<MetricKey, MetricDef> = {
  open_question_ratio: { key: 'open_question_ratio', direction: 'higher', minDelta: 5, unit: 'percent' },
  paraphrase_score: { key: 'paraphrase_score', direction: 'higher', minDelta: 5, unit: 'percent' },
  active_listening: { key: 'active_listening', direction: 'higher', minDelta: 5, unit: 'points' },
  talk_ratio: { key: 'talk_ratio', direction: 'lower', minDelta: 5, unit: 'percent' },
  adaptation_score: { key: 'adaptation_score', direction: 'higher', minDelta: 5, unit: 'points' },
  clear_steps_per_turn: { key: 'clear_steps_per_turn', direction: 'higher', minDelta: 0.15, unit: 'steps' },
  drill_score: { key: 'drill_score', direction: 'higher', minDelta: 10, unit: 'points' },
}

export function isMetricKey(v: unknown): v is MetricKey {
  return typeof v === 'string' && (METRIC_KEYS as readonly string[]).includes(v)
}

export type MetricValues = Partial<Record<MetricKey, number | null>>

/** One practice session, reduced to the common shape. Created only by sources.ts. */
export interface PracticeRecord {
  id: string
  /** ISO timestamp of the practice. */
  at: string
  source: 'ai_doctor' | 'colleague_roleplay' | 'drill'
  /** Same value = same scenario (e.g. the same objection type), so repeats compare like with like. */
  scenarioKey: string | null
  metrics: MetricValues
  /** Number of critical moments the evaluator found; null when none were analysed. */
  criticalMoments: number | null
}

export const round1 = (n: number): number => Math.round(n * 10) / 10
export const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** Signed change expressed so that positive always means "better". */
export function improvement(key: MetricKey, delta: number): number {
  return METRICS[key].direction === 'higher' ? delta : -delta
}

/** Keeps one record per id (the latest `at` wins), sorted oldest first with id as tie-break. */
export function normalizeRecords(records: readonly PracticeRecord[]): PracticeRecord[] {
  const byId = new Map<string, PracticeRecord>()
  for (const r of records) {
    const cur = byId.get(r.id)
    if (!cur || Date.parse(r.at) > Date.parse(cur.at)) byId.set(r.id, r)
  }
  return [...byId.values()]
    .filter(r => Number.isFinite(Date.parse(r.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
}

/** Measured values for one metric, oldest first. Missing/non-finite values are skipped, never zeroed. */
export function series(records: readonly PracticeRecord[], key: MetricKey): { id: string; at: string; value: number }[] {
  const out: { id: string; at: string; value: number }[] = []
  for (const r of records) {
    const v = r.metrics[key]
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ id: r.id, at: r.at, value: v })
  }
  return out
}
