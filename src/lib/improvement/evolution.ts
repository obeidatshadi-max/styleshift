import { METRIC_KEYS, METRICS, improvement, mean, normalizeRecords, round1, series, type MetricKey, type PracticeRecord } from './metrics'

// Behavioral Evolution: how each metric moves across sessions. Every claim needs
// enough points - below MIN_POINTS the answer is "insufficient", never a trend.
// Compared per (metric, source): an AI-Doctor open-question rate and a colleague
// roleplay open-question rate are measured differently and must not be pooled.

export const MIN_POINTS = 4
export const ESTABLISHED_POINTS = 8
export const MAX_WINDOW = 5

export type Trend = 'improving' | 'declining' | 'stable' | 'insufficient'
export type Confidence = 'insufficient' | 'emerging' | 'established'

export interface RepeatComparison {
  scenarioKey: string
  n: number
  first: number
  latest: number
  /** latest - first, positive = better. */
  change: number
  verdict: 'better' | 'worse' | 'same'
}

export interface MetricEvolution {
  key: MetricKey
  source: PracticeRecord['source']
  n: number
  earlierAvg: number | null
  recentAvg: number | null
  /** recentAvg - earlierAvg, positive = better (direction-adjusted). Null when insufficient. */
  change: number | null
  trend: Trend
  confidence: Confidence
  /** Same scenario practised again: first vs latest attempt. Fairest comparison available. */
  repeats: RepeatComparison[]
}

function confidenceFor(n: number): Confidence {
  return n >= ESTABLISHED_POINTS ? 'established' : n >= MIN_POINTS ? 'emerging' : 'insufficient'
}

function repeatComparisons(records: readonly PracticeRecord[], key: MetricKey): RepeatComparison[] {
  const byScenario = new Map<string, { value: number }[]>()
  for (const r of records) {
    const v = r.metrics[key]
    if (r.scenarioKey === null || typeof v !== 'number' || !Number.isFinite(v)) continue
    byScenario.set(r.scenarioKey, [...(byScenario.get(r.scenarioKey) ?? []), { value: v }])
  }
  const out: RepeatComparison[] = []
  for (const [scenarioKey, list] of [...byScenario.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length < 2) continue
    const first = list[0].value, latest = list[list.length - 1].value
    const change = round1(improvement(key, latest - first))
    out.push({
      scenarioKey, n: list.length, first, latest, change,
      verdict: Math.abs(change) < METRICS[key].minDelta ? 'same' : change > 0 ? 'better' : 'worse',
    })
  }
  return out
}

export function computeEvolution(records: readonly PracticeRecord[]): MetricEvolution[] {
  const sorted = normalizeRecords(records)
  const sources = [...new Set(sorted.map(r => r.source))].sort()
  const out: MetricEvolution[] = []
  for (const source of sources) {
    const own = sorted.filter(r => r.source === source)
    for (const key of METRIC_KEYS) {
      const pts = series(own, key)
      if (pts.length === 0) continue
      const n = pts.length
      const confidence = confidenceFor(n)
      const repeats = repeatComparisons(own, key)
      if (n < MIN_POINTS) {
        out.push({ key, source, n, earlierAvg: null, recentAvg: null, change: null, trend: 'insufficient', confidence, repeats })
        continue
      }
      const w = Math.min(MAX_WINDOW, Math.floor(n / 2))
      const recent = pts.slice(-w).map(p => p.value)
      const earlier = pts.slice(-2 * w, -w).map(p => p.value)
      const recentAvg = round1(mean(recent)), earlierAvg = round1(mean(earlier))
      const change = round1(improvement(key, recentAvg - earlierAvg))
      const trend: Trend = Math.abs(change) < METRICS[key].minDelta ? 'stable' : change > 0 ? 'improving' : 'declining'
      out.push({ key, source, n, earlierAvg, recentAvg, change, trend, confidence, repeats })
    }
  }
  return out
}
