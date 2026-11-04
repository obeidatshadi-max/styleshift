import type { ClearStep, ObjectionType } from '@/lib/voice-partner-core'
import type { MastermindInsight } from '@/lib/mastermind-coach'
import { METRICS, type MetricKey, type PracticeRecord } from './metrics'
import { MIN_POINTS, type Confidence, type MetricEvolution } from './evolution'

// Personal Coaching Roadmap: at most MAX_ITEMS focus items, each with ONE drill the
// app already has and a success test that can be checked later. Text is not built
// here: items carry codes the UI translates (EN / Iraqi Arabic), so nothing in this
// file can drift from what the numbers say.

export const MAX_ITEMS = 3
/** Sessions that must follow an item before its success test is judged. */
export const MIN_SESSIONS_AFTER = 2

export type DrillKind = 'precision_drill' | 'ai_doctor_objection' | 'colleague_roleplay' | 'micro_practice'

export interface DrillRecommendation {
  kind: DrillKind
  objectionType: ObjectionType | null
  clearStep: ClearStep | null
}

export type RoadmapReason = 'declining' | 'objection_pattern' | 'needs_more_data'

export interface RoadmapItem {
  id: string
  reason: RoadmapReason
  metricKey: MetricKey | null
  source: PracticeRecord['source'] | null
  confidence: Confidence
  tier: 'observed_practice'
  drill: DrillRecommendation
  /** Numbers behind the item, copied from the evolution/insight, never estimated. */
  evidence: { n: number; earlierAvg: number | null; recentAvg: number | null; change: number | null } | null
  /** Session counts still needed (needs_more_data only). */
  sessionsNeeded: number | null
  success: { metricKey: MetricKey | null; minChange: number; minSessions: number } | null
}

export interface Roadmap {
  status: 'no_data' | 'insufficient' | 'ready'
  items: RoadmapItem[]
}

const DRILL_FOR_METRIC: Record<MetricKey, DrillRecommendation> = {
  open_question_ratio: { kind: 'precision_drill', objectionType: null, clearStep: 'clarify' },
  paraphrase_score: { kind: 'colleague_roleplay', objectionType: null, clearStep: 'listen' },
  active_listening: { kind: 'colleague_roleplay', objectionType: null, clearStep: 'listen' },
  talk_ratio: { kind: 'colleague_roleplay', objectionType: null, clearStep: 'listen' },
  adaptation_score: { kind: 'ai_doctor_objection', objectionType: null, clearStep: null },
  clear_steps_per_turn: { kind: 'ai_doctor_objection', objectionType: null, clearStep: 'recheck' },
  drill_score: { kind: 'micro_practice', objectionType: null, clearStep: null },
}

const METRIC_FOR_GRAVITY: Record<string, MetricKey | null> = {
  openQuestionRatio: 'open_question_ratio',
  clearStepsPerTurn: 'clear_steps_per_turn',
  avgRepTurnLength: null,
}

const rank = (c: Confidence) => (c === 'established' ? 2 : c === 'emerging' ? 1 : 0)

function decliningItem(e: MetricEvolution): RoadmapItem {
  return {
    id: `declining:${e.source}:${e.key}`, reason: 'declining', metricKey: e.key, source: e.source,
    confidence: e.confidence, tier: 'observed_practice', drill: { ...DRILL_FOR_METRIC[e.key] },
    evidence: { n: e.n, earlierAvg: e.earlierAvg, recentAvg: e.recentAvg, change: e.change },
    sessionsNeeded: null,
    // Success = win back the loss: at least the noise floor, or the size of the drop if larger.
    success: { metricKey: e.key, minChange: Math.max(METRICS[e.key].minDelta, Math.abs(e.change ?? 0)), minSessions: MIN_SESSIONS_AFTER },
  }
}

function patternItem(insight: MastermindInsight): RoadmapItem {
  const ev = insight.evidence
  const metricKey = ev.metric ? METRIC_FOR_GRAVITY[ev.metric] ?? null : null
  return {
    id: `pattern:${insight.source}:${insight.experiment.objectionType}:${insight.experiment.focusStep}`,
    reason: 'objection_pattern', metricKey, source: 'ai_doctor',
    // Gravity needs >=3 sessions per trigger before it reports: emerging, never established.
    confidence: 'emerging', tier: 'observed_practice',
    drill: { kind: 'ai_doctor_objection', objectionType: insight.experiment.objectionType, clearStep: insight.experiment.focusStep },
    evidence: { n: ev.sessionCount, earlierAvg: ev.baselineAvg ?? null, recentAvg: ev.triggerAvg ?? null, change: null },
    sessionsNeeded: null,
    success: metricKey ? { metricKey, minChange: METRICS[metricKey].minDelta, minSessions: MIN_SESSIONS_AFTER } : null,
  }
}

/**
 * Picks what to work on. Order: declining metrics with enough evidence (largest
 * real drop first, established before emerging), then objection patterns the
 * Mastermind Coach already found. With nothing to act on but thin data, the single
 * item says how many more sessions are needed; it never invents a focus.
 */
export function buildRoadmap(evolutions: readonly MetricEvolution[], insights: readonly MastermindInsight[]): Roadmap {
  if (evolutions.length === 0 && insights.length === 0) return { status: 'no_data', items: [] }

  const declining = evolutions
    .filter(e => e.trend === 'declining' && e.change !== null)
    .sort((a, b) => rank(b.confidence) - rank(a.confidence) || Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0)
      || a.key.localeCompare(b.key) || a.source.localeCompare(b.source))
    .map(decliningItem)
  const patterns = insights.map(patternItem)

  const seen = new Set<string>()
  const items: RoadmapItem[] = []
  for (const it of [...declining, ...patterns]) {
    // One item per drill target: a declining metric and a pattern pointing at the same drill collapse.
    const k = `${it.drill.kind}:${it.drill.objectionType}:${it.drill.clearStep}`
    if (seen.has(k)) continue
    seen.add(k)
    items.push(it)
    if (items.length === MAX_ITEMS) break
  }

  if (items.length > 0) return { status: 'ready', items }

  const thin = evolutions.filter(e => e.trend === 'insufficient')
  if (thin.length === 0) return { status: 'ready', items: [] } // enough data, nothing declining: keep going
  const closest = [...thin].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))[0]
  return {
    status: 'insufficient',
    items: [{
      id: `needs_more_data:${closest.source}:${closest.key}`, reason: 'needs_more_data', metricKey: closest.key, source: closest.source,
      confidence: 'insufficient', tier: 'observed_practice', drill: { ...DRILL_FOR_METRIC[closest.key] },
      evidence: { n: closest.n, earlierAvg: null, recentAvg: null, change: null },
      sessionsNeeded: MIN_POINTS - closest.n, success: null,
    }],
  }
}
