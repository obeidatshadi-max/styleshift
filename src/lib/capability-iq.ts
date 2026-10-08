import type { BehaviorEvent } from '@/schemas/pattern'
import {
  CAPABILITY_DIMENSIONS, defaultCapabilityConfig,
  type Band, type CapabilityConfig, type CapabilityDimension,
} from '@/scoring/capability'

export interface EvidenceItem {
  behavior: string
  effect: 'helped' | 'hurt'
  sessionId: string
  confidence: number
  /** Verbatim transcript text of the first evidence turn; null if none was kept. */
  quote: string | null
}

export type Confidence = 'low' | 'medium' | 'high'
export type Trend = 'improving' | 'worsening' | 'stable' | 'unclear'

interface Common {
  dimension: CapabilityDimension
  eventsUsed: number
  sessionsUsed: number
  /** Carried from the config so the UI can say what is NOT measured. */
  limit: 'accuracy_not_measured' | null
}

export type DimensionResult =
  | (Common & { status: 'insufficient_evidence'; needed: { events: number; sessions: number } })
  | (Common & {
      status: 'scored'
      /** 0-100, rounded to the config's step: a band-sized reading, not a measurement. */
      score: number
      band: Band
      confidence: Confidence
      trend: Trend
      evidence: { helped: EvidenceItem[]; hurt: EvidenceItem[] }
    })

export interface CapabilityReport {
  configVersion: string
  sessionsConsidered: number
  /** No overall score exists on purpose. */
  dimensions: Record<CapabilityDimension, DimensionResult>
}

interface SessionValue { sessionId: string; at: string | null; value: number; mass: number }

const MAX_EVIDENCE_PER_SIDE = 3

function bandOf(score: number, cfg: CapabilityConfig): Band {
  return (['advanced', 'strong', 'building'] as const).find(b => score >= cfg.bands[b]) ?? 'developing'
}

const roundTo = (n: number, step: number) => Math.max(0, Math.min(100, Math.round(n / step) * step))

/** Mean of session values weighted by the square root of their evidence mass (more evidence counts for more, with diminishing returns). */
function weightedMean(values: readonly SessionValue[]): number {
  let num = 0, den = 0
  for (const v of values) { const w = Math.sqrt(v.mass); num += v.value * w; den += w }
  return den > 0 ? num / den : 50
}

/**
 * Capability dimensions from behavior events. Every number is arithmetic over
 * grounded events; nothing is model-judged here.
 *
 *  - session value = 50 + 50 * (helped - hurt) / (evidence + shrinkage), evidence = sum of weight * confidence
 *  - dimension score = evidence-weighted mean of session values over the newest `window` sessions
 *  - not scored unless there are enough events across enough different sessions
 *  - trend compares the newer and older halves of the sessions, and only with enough sessions
 *  - no overall score: dimensions are never averaged together
 */
export function computeCapabilityIQ(events: readonly BehaviorEvent[], cfg: CapabilityConfig = defaultCapabilityConfig): CapabilityReport {
  // Newest sessions first; a session with no timestamp counts as oldest.
  const sessionAt = new Map<string, string | null>()
  for (const e of events) if (!sessionAt.has(e.sessionId) || (e.occurredAt && !sessionAt.get(e.sessionId))) sessionAt.set(e.sessionId, e.occurredAt)
  const recent = [...sessionAt.entries()]
    .sort((a, b) => (b[1] ?? '').localeCompare(a[1] ?? ''))
    .slice(0, cfg.window)
  const inWindow = new Set(recent.map(([id]) => id))
  const windowEvents = events.filter(e => inWindow.has(e.sessionId))

  const dimensions = {} as Record<CapabilityDimension, DimensionResult>
  for (const dimension of CAPABILITY_DIMENSIONS) {
    const dim = cfg.dimensions[dimension]
    const mine = windowEvents.filter(e => e.behavior in dim.behaviors)
    const sessionsUsed = new Set(mine.map(e => e.sessionId)).size
    const common = { dimension, eventsUsed: mine.length, sessionsUsed, limit: dim.limit }
    if (mine.length < cfg.minEvents || sessionsUsed < cfg.minSessions) {
      dimensions[dimension] = { ...common, status: 'insufficient_evidence', needed: { events: cfg.minEvents, sessions: cfg.minSessions } }
      continue
    }

    const weightOf = (e: BehaviorEvent) => dim.behaviors[e.behavior] * e.confidence
    const perSession: SessionValue[] = [...new Set(mine.map(e => e.sessionId))].map(sessionId => {
      const evs = mine.filter(e => e.sessionId === sessionId)
      const mass = evs.reduce((s, e) => s + weightOf(e), 0)
      const net = evs.reduce((s, e) => s + (e.effect === 'helped' ? 1 : -1) * weightOf(e), 0)
      return { sessionId, at: sessionAt.get(sessionId) ?? null, mass, value: 50 + 50 * (net / (mass + cfg.shrinkage)) }
    })

    const score = roundTo(weightedMean(perSession), cfg.roundTo)

    // Trend: oldest -> newest, newer half vs older half.
    const ordered = [...perSession].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
    let trend: Trend = 'unclear'
    if (ordered.length >= cfg.trend.minSessions) {
      const half = Math.floor(ordered.length / 2)
      const change = weightedMean(ordered.slice(half)) - weightedMean(ordered.slice(0, half))
      trend = change >= cfg.trend.minChange ? 'improving' : change <= -cfg.trend.minChange ? 'worsening' : 'stable'
    }

    const meanConfidence = mine.reduce((s, e) => s + e.confidence, 0) / mine.length
    const points = (sessionsUsed >= 4 ? 1 : 0) + (mine.length >= 8 ? 1 : 0) + (meanConfidence >= 0.7 ? 1 : 0)
    const confidence: Confidence = points >= 3 ? 'high' : points === 2 ? 'medium' : 'low'

    const toEvidence = (e: BehaviorEvent): EvidenceItem => ({
      behavior: e.behavior, effect: e.effect, sessionId: e.sessionId, confidence: e.confidence, quote: e.evidence[0]?.text ?? null,
    })
    const top = (effect: 'helped' | 'hurt') => mine.filter(e => e.effect === effect)
      .sort((a, b) => weightOf(b) - weightOf(a)).slice(0, MAX_EVIDENCE_PER_SIDE).map(toEvidence)

    dimensions[dimension] = {
      ...common, status: 'scored', score, band: bandOf(score, cfg), confidence, trend,
      evidence: { helped: top('helped'), hurt: top('hurt') },
    }
  }
  return { configVersion: cfg.version, sessionsConsidered: recent.length, dimensions }
}
