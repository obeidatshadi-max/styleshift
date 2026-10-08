import type {
  BehaviorEvent, CaveatCode, ConfidenceLevel, EventContext, EventEvidence, InsightRecommendation, PatternInsight, PatternRecord,
} from '@/schemas/pattern'
import { buildPatternRecords } from '@/lib/pattern-records'
import { confidenceLevel, rankWeaknesses, targetedSetup } from '@/lib/challenge-engine'
import { CHALLENGE_MAP } from '@/lib/challenge-map'
import { CAPABILITY_DIMENSIONS, defaultCapabilityConfig, type CapabilityDimension } from '@/scoring/capability'

/**
 * Longitudinal behavior memory. Four layers stay separate in every insight:
 *   observed        counts and the rep's own words
 *   interpretation  a hedged reading, labelled inferred, with caveats - never a trait, motive or cause
 *   recommendation  what to practise (never a change to scoring weights)
 *   confidence      how much evidence stands behind it
 * Nothing is stored: insights are recomputed from the rep's stored simulations,
 * so deleting that history deletes the memory with it.
 */
export const PATTERN_MEMORY_RULES = {
  /** Newest finished simulations considered. */
  window: 20,
  /** A context group needs this many sessions to be compared. */
  contrastMinSessions: 3,
  /** Smallest gap in "share of sessions where it went well" between two contexts that is worth saying. */
  contrastGap: 0.4,
  /** A habit absent from this many newest sessions counts as changed rather than current. */
  quietSessions: 5,
  /** Fewer sessions than this is flagged as a small sample. */
  smallSample: 6,
  /** Needed before a "habit changed" insight: enough history to see a before and after. */
  minSessionsForResolved: 8,
  maxPerKind: { recurring_hurt: 3, recurring_strength: 2, context_contrast: 2, resolved_hurt: 2 },
} as const

const MAX_EVIDENCE = 3

/** Feature flag for pattern memory. */
export const patternMemoryEnabled = () => process.env.PATTERN_MEMORY_ENABLED === 'true'

/** Which micro-practice drill suits a capability area (adaptation depends on the style). */
const DIMENSION_DRILL: Record<CapabilityDimension, string> = {
  interaction: 'clarification-1', clinical: 'evidence-response-1', adaptation: 'difficult-analytical-1',
  discovery: 'needs-discovery-1', commitment: 'commitment-closing-1',
}

function evidenceFor(events: readonly BehaviorEvent[], behavior: string, effect: 'helped' | 'hurt', sessionIdsNewestFirst: readonly string[]): EventEvidence[] {
  const rank = new Map(sessionIdsNewestFirst.map((id, i) => [id, i]))
  return events
    .filter(e => e.behavior === behavior && e.effect === effect && e.evidence.length > 0)
    .sort((a, b) => (rank.get(a.sessionId) ?? 99) - (rank.get(b.sessionId) ?? 99))
    .slice(0, MAX_EVIDENCE).map(e => e.evidence[0])
}

const caveats = (considered: number, extra: CaveatCode[] = []): CaveatCode[] =>
  [...(considered < PATTERN_MEMORY_RULES.smallSample ? ['small_sample' as const] : []), 'no_cause_known', ...extra]

const hasContext = (c: PatternRecord['dominantContext']) => !!(c.physicianStyle || c.objectionType || c.difficulty)

type ContextKey = 'physicianStyle' | 'objectionType'
interface Group { value: string; positive: number; sessions: number }

function contrasts(events: readonly BehaviorEvent[], ids: readonly string[]): PatternInsight[] {
  const considered = new Set(ids)
  const inWindow = events.filter(e => considered.has(e.sessionId))
  const contextOf = new Map<string, EventContext>(inWindow.map(e => [e.sessionId, e.context]))
  const out: Array<PatternInsight & { gap: number; minN: number }> = []

  for (const dimension of CAPABILITY_DIMENSIONS) {
    const weights = defaultCapabilityConfig.dimensions[dimension].behaviors
    const net = new Map<string, number>() // session -> helped minus hurt, weighted, for this dimension only
    for (const e of inWindow) if (e.behavior in weights) net.set(e.sessionId, (net.get(e.sessionId) ?? 0) + (e.effect === 'helped' ? 1 : -1) * weights[e.behavior] * e.confidence)

    for (const contextKey of ['physicianStyle', 'objectionType'] as const satisfies readonly ContextKey[]) {
      const groups = new Map<string, Group>()
      for (const [sessionId, value] of net) {
        const ctxValue = contextOf.get(sessionId)?.[contextKey]
        if (!ctxValue || value === 0) continue
        const g = groups.get(ctxValue) ?? { value: ctxValue, positive: 0, sessions: 0 }
        g.sessions++
        if (value > 0) g.positive++
        groups.set(ctxValue, g)
      }
      const eligible = [...groups.values()].filter(g => g.sessions >= PATTERN_MEMORY_RULES.contrastMinSessions)
      if (eligible.length < 2) continue
      const rate = (g: Group) => g.positive / g.sessions
      eligible.sort((a, b) => rate(b) - rate(a) || b.sessions - a.sessions || a.value.localeCompare(b.value))
      const higher = eligible[0], lower = eligible[eligible.length - 1]
      const gap = rate(higher) - rate(lower)
      if (gap < PATTERN_MEMORY_RULES.contrastGap) continue

      const lowerSessions = new Set([...net].filter(([id]) => contextOf.get(id)?.[contextKey] === lower.value).map(([id]) => id))
      const evidence = inWindow.filter(e => e.effect === 'hurt' && e.behavior in weights && lowerSessions.has(e.sessionId) && e.evidence.length)
        .slice(0, MAX_EVIDENCE).map(e => e.evidence[0])
      const minN = Math.min(higher.sessions, lower.sessions)
      const meanConf = inWindow.filter(e => e.behavior in weights).reduce((s, e, _, a) => s + e.confidence / a.length, 0)
      const points = (minN >= 5 ? 1 : 0) + (ids.length >= 10 ? 1 : 0) + (meanConf >= 0.7 ? 1 : 0)
      const style = contextKey === 'physicianStyle' ? lower.value : null
      const drillId = dimension === 'adaptation' && style === 'driver' ? 'resistant-driver-1' : DIMENSION_DRILL[dimension]
      out.push({
        id: `context_contrast:${dimension}:${contextKey}`, kind: 'context_contrast',
        observed: { sessionsConsidered: ids.length, contrast: { dimension, contextKey, higher, lower }, evidence },
        interpretation: { code: 'varies_by_context', certainty: 'inferred', caveats: caveats(ids.length, ['scenarios_not_random']) },
        recommendation: { kind: 'drill', drillId, focus: dimension, changesScoringConfig: false },
        confidence: points >= 3 ? 'high' : points === 2 ? 'medium' : 'low', gap, minN,
      })
    }
  }
  return out.sort((a, b) => b.gap - a.gap || b.minN - a.minN || a.id.localeCompare(b.id))
    .slice(0, PATTERN_MEMORY_RULES.maxPerKind.context_contrast).map(({ gap: _g, minN: _n, ...insight }) => { void [_g, _n]; return insight })
}

/** Insights for one rep, strongest first within each kind. Pure and deterministic. */
export function buildInsights(events: readonly BehaviorEvent[], sessionIdsNewestFirst: readonly string[]): PatternInsight[] {
  const R = PATTERN_MEMORY_RULES
  const ids = sessionIdsNewestFirst.slice(0, R.window)
  const n = ids.length
  const insights: PatternInsight[] = []

  // Recurring habits that hurt, ranked the same way the recommended-practice card ranks them.
  for (const w of rankWeaknesses(events, ids).slice(0, R.maxPerKind.recurring_hurt)) {
    const p = w.pattern, target = CHALLENGE_MAP[p.behavior]
    insights.push({
      id: `recurring_hurt:${p.behavior}`, kind: 'recurring_hurt',
      observed: { sessionsWith: p.sessionsWith, sessionsConsidered: n, behavior: p.behavior, trend: p.trend, context: p.dominantContext, evidence: evidenceFor(events, p.behavior, 'hurt', ids) },
      interpretation: { code: hasContext(p.dominantContext) ? 'habit_under_conditions' : 'recurring_habit', certainty: 'inferred', caveats: caveats(n) },
      recommendation: { kind: 'drill', drillId: target.drillByStyle?.[targetedSetup(w, 'en').physicianStyle] ?? target.drillId, focus: p.behavior, changesScoringConfig: false },
      confidence: w.confidenceLevel,
    })
  }

  const records = buildPatternRecords(events, ids)
  const keepGoing = (focus: string): InsightRecommendation => ({ kind: 'keep_going', drillId: null, focus, changesScoringConfig: false })

  // Recurring strengths worth keeping.
  records.filter(p => p.effect === 'helped' && p.recencySessions < R.quietSessions)
    .sort((a, b) => b.sessionsWith - a.sessionsWith || b.confidence - a.confidence || a.behavior.localeCompare(b.behavior))
    .slice(0, R.maxPerKind.recurring_strength)
    .forEach(p => insights.push({
      id: `recurring_strength:${p.behavior}`, kind: 'recurring_strength',
      observed: { sessionsWith: p.sessionsWith, sessionsConsidered: n, behavior: p.behavior, trend: p.trend, context: p.dominantContext, evidence: evidenceFor(events, p.behavior, 'helped', ids) },
      interpretation: { code: 'reliable_strength', certainty: 'inferred', caveats: caveats(n) },
      recommendation: keepGoing(p.behavior), confidence: confidenceLevel(p),
    }))

  // Habits that used to hurt and have not shown up lately: reinforcement, only with enough history to see a before and after.
  if (n >= R.minSessionsForResolved) {
    records.filter(p => p.effect === 'hurt' && p.behavior in CHALLENGE_MAP && p.recencySessions >= R.quietSessions)
      .sort((a, b) => b.sessionsWith - a.sessionsWith || a.behavior.localeCompare(b.behavior))
      .slice(0, R.maxPerKind.resolved_hurt)
      .forEach(p => insights.push({
        id: `resolved_hurt:${p.behavior}`, kind: 'resolved_hurt',
        observed: { sessionsWith: p.sessionsWith, sessionsConsidered: n, behavior: p.behavior, trend: p.trend, evidence: [] },
        interpretation: { code: 'habit_changed', certainty: 'inferred', caveats: caveats(n) },
        recommendation: keepGoing(p.behavior), confidence: confidenceLevel(p),
      }))
  }

  return [...insights, ...contrasts(events, ids)]
}

export type { ConfidenceLevel }
