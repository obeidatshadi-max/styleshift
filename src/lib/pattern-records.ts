import type { BehaviorEvent, EventContext, PatternRecord, TrendDirection } from '@/schemas/pattern'
import { MIN_SESSIONS_FOR_PATTERN } from '@/lib/pattern-events'

/** A context value must account for this share of a pattern's events to be called its context. */
const CONTEXT_SHARE = 0.6
/** ...and be backed by at least this many events. */
const CONTEXT_MIN_EVENTS = 2
/** Change in how often a behavior shows up (newer half vs older half of sessions) that counts as a trend. */
const TREND_CHANGE = 0.25
const TREND_MIN_SESSIONS = 4

type ContextKey = 'physicianStyle' | 'difficulty' | 'objectionType' | 'language'
const CONTEXT_KEYS: readonly ContextKey[] = ['physicianStyle', 'difficulty', 'objectionType', 'language']

function dominantContext(events: readonly BehaviorEvent[]): PatternRecord['dominantContext'] {
  const out: Record<string, unknown> = {}
  for (const key of CONTEXT_KEYS) {
    const values = events.map(e => e.context[key]).filter((v): v is NonNullable<EventContext[ContextKey]> => v !== null && v !== undefined)
    if (values.length < CONTEXT_MIN_EVENTS) continue
    const counts = new Map<string, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    const [top, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    if (count >= CONTEXT_MIN_EVENTS && count / values.length >= CONTEXT_SHARE) out[key] = top
  }
  return out as PatternRecord['dominantContext']
}

function trendOf(withBehavior: ReadonlySet<string>, sessionIdsNewestFirst: readonly string[]): TrendDirection {
  if (sessionIdsNewestFirst.length < TREND_MIN_SESSIONS) return 'unclear'
  const half = Math.floor(sessionIdsNewestFirst.length / 2)
  const rate = (ids: readonly string[]) => (ids.length ? ids.filter(id => withBehavior.has(id)).length / ids.length : 0)
  const change = rate(sessionIdsNewestFirst.slice(0, half)) - rate(sessionIdsNewestFirst.slice(half))
  return change >= TREND_CHANGE ? 'worsening' : change <= -TREND_CHANGE ? 'improving' : 'stable'
}

/**
 * Recurring behaviors across sessions: arithmetic over events, nothing inferred.
 * `sessionIdsNewestFirst` is EVERY session considered (including ones where
 * nothing was observed), so frequency and recency are not biased toward
 * sessions that happened to produce events. Only behaviors seen in at least
 * MIN_SESSIONS_FOR_PATTERN distinct sessions become a record: one event is
 * an anecdote, not a pattern.
 *
 * `trend` is about how OFTEN the behavior occurs, whichever its effect:
 * for a 'hurt' behavior, 'improving' means it is showing up less.
 */
export function buildPatternRecords(events: readonly BehaviorEvent[], sessionIdsNewestFirst: readonly string[]): PatternRecord[] {
  const considered = new Set(sessionIdsNewestFirst)
  const inWindow = events.filter(e => considered.has(e.sessionId))
  const groups = new Map<string, BehaviorEvent[]>()
  for (const e of inWindow) groups.set(`${e.behavior}|${e.effect}`, [...(groups.get(`${e.behavior}|${e.effect}`) ?? []), e])

  const records: PatternRecord[] = []
  for (const group of groups.values()) {
    const sessions = new Set(group.map(e => e.sessionId))
    if (sessions.size < MIN_SESSIONS_FOR_PATTERN) continue
    const latest = sessionIdsNewestFirst.findIndex(id => sessions.has(id))
    records.push({
      behavior: group[0].behavior,
      effect: group[0].effect,
      sessionsWith: sessions.size,
      sessionsConsidered: sessionIdsNewestFirst.length,
      recencySessions: latest,
      confidence: group.reduce((s, e) => s + e.confidence, 0) / group.length,
      trend: trendOf(sessions, sessionIdsNewestFirst),
      dominantContext: dominantContext(group),
      eventIds: group.map(e => e.id).sort(),
    })
  }
  return records.sort((a, b) => a.behavior.localeCompare(b.behavior) || a.effect.localeCompare(b.effect))
}
