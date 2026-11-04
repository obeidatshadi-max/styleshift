import { METRIC_KEYS, METRICS, improvement, mean, normalizeRecords, round1, series, type MetricKey, type PracticeRecord } from './metrics'

// Conversation Snapshot: one session, every metric, each compared with the rep's
// OWN earlier sessions from the same source. Same inputs always give the same
// output: records are de-duplicated, sorted (time, then id) and only strictly
// earlier sessions count as the baseline.

/** Earlier sessions needed before a comparison is made at all. */
export const MIN_BASELINE = 2
/** Only the most recent earlier sessions form the baseline, so old habits do not dilute it. */
export const BASELINE_WINDOW = 5

export type Verdict = 'better' | 'worse' | 'same' | 'no_baseline' | 'not_measured'

export interface MetricSnapshot {
  key: MetricKey
  value: number | null
  baseline: number | null
  baselineN: number
  /** value - baseline in display units (raw, not direction-adjusted). */
  delta: number | null
  verdict: Verdict
}

export interface ConversationSnapshot {
  sessionId: string
  at: string
  source: PracticeRecord['source']
  scenarioKey: string | null
  tier: 'observed_practice'
  metrics: MetricSnapshot[]
  criticalMoments: number | null
  /** How many metrics were measured in this session. */
  measuredCount: number
  /** True when at least one metric could be compared with a baseline. */
  comparable: boolean
}

export function buildSnapshot(records: readonly PracticeRecord[], sessionId: string): ConversationSnapshot | null {
  const sorted = normalizeRecords(records)
  const idx = sorted.findIndex(r => r.id === sessionId)
  if (idx < 0) return null
  const current = sorted[idx]
  const earlier = sorted.slice(0, idx).filter(r => r.source === current.source)

  const metrics: MetricSnapshot[] = METRIC_KEYS.map(key => {
    const raw = current.metrics[key]
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    if (value === null) return { key, value: null, baseline: null, baselineN: 0, delta: null, verdict: 'not_measured' as const }
    const prior = series(earlier, key).slice(-BASELINE_WINDOW)
    if (prior.length < MIN_BASELINE) return { key, value, baseline: null, baselineN: prior.length, delta: null, verdict: 'no_baseline' as const }
    const baseline = round1(mean(prior.map(p => p.value)))
    const delta = round1(value - baseline)
    const better = improvement(key, delta)
    const verdict: Verdict = Math.abs(delta) < METRICS[key].minDelta ? 'same' : better > 0 ? 'better' : 'worse'
    return { key, value, baseline, baselineN: prior.length, delta, verdict }
  }).filter(m => m.verdict !== 'not_measured' || m.value !== null)

  const measured = metrics.filter(m => m.value !== null)
  return {
    sessionId: current.id, at: current.at, source: current.source, scenarioKey: current.scenarioKey, tier: 'observed_practice',
    metrics: measured, criticalMoments: current.criticalMoments,
    measuredCount: measured.length,
    comparable: measured.some(m => m.verdict === 'better' || m.verdict === 'worse' || m.verdict === 'same'),
  }
}

/** Snapshot of the most recent session, or null when the rep has none. */
export function latestSnapshot(records: readonly PracticeRecord[]): ConversationSnapshot | null {
  const sorted = normalizeRecords(records)
  const last = sorted[sorted.length - 1]
  return last ? buildSnapshot(sorted, last.id) : null
}
