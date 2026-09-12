import type { RoleplaySessionSummary } from '@/types/game'

export type RoleplayMetricKey = 'talkRatio' | 'questionRatio' | 'openQuestionRatio' | 'paraphraseScore' | 'activeListening' | 'adaptationScore'

// Whether a higher number is the better outcome for this metric. talk_ratio
// is the one exception — the coaching goal (see sps "Field Action Tip") is
// the rep talking LESS, closer to the 70/30 rule.
const HIGHER_IS_BETTER: Record<RoleplayMetricKey, boolean> = {
  talkRatio: false,
  questionRatio: true,
  openQuestionRatio: true,
  paraphraseScore: true,
  activeListening: true,
  adaptationScore: true,
}

// Ratios (talk/question/openQuestion/paraphrase) are stored 0-1 and compared
// in percentage points; active listening and adaptation score are already
// stored 0-100.
const SCALE: Record<RoleplayMetricKey, number> = {
  talkRatio: 100,
  questionRatio: 100,
  openQuestionRatio: 100,
  paraphraseScore: 100,
  activeListening: 1,
  adaptationScore: 1,
}

function metricValue(s: RoleplaySessionSummary, key: RoleplayMetricKey): number | null {
  switch (key) {
    case 'talkRatio': return s.talk_ratio
    case 'questionRatio': return s.question_ratio
    case 'openQuestionRatio': return s.open_question_ratio
    case 'paraphraseScore': return s.paraphrase_score
    case 'activeListening': return s.active_listening_score
    case 'adaptationScore': return s.adaptation_score
  }
}

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export interface RoleplayTrend {
  metric: RoleplayMetricKey
  direction: 'improving' | 'declining'
  delta: number // absolute change, in the metric's display scale (points)
}

export interface RoleplayHistorySummary {
  count: number
  averages: Partial<Record<RoleplayMetricKey, number>> // in display scale (0-100)
  trend: RoleplayTrend | null
}

const METRICS: RoleplayMetricKey[] = ['talkRatio', 'questionRatio', 'openQuestionRatio', 'paraphraseScore', 'activeListening', 'adaptationScore']

// A trend needs at least this many display-scale points of movement to be
// worth surfacing — otherwise session-to-session noise reads as a "trend".
const TREND_THRESHOLD = 5

/**
 * Turns a rep's roleplay session history (newest first, same shape as
 * useColleagueSessions/useDoctorRoleplaySessions) into per-metric averages
 * and the single most notable trend, for a cumulative profiling summary
 * instead of just a list of individual sessions.
 */
export function summarizeRoleplayHistory(sessions: RoleplaySessionSummary[]): RoleplayHistorySummary | null {
  if (sessions.length === 0) return null

  const averages: Partial<Record<RoleplayMetricKey, number>> = {}
  for (const key of METRICS) {
    const values = sessions.map(s => metricValue(s, key)).filter((v): v is number => v != null)
    const avg = average(values)
    if (avg != null) averages[key] = Math.round(avg * SCALE[key] * 10) / 10
  }

  let trend: RoleplayTrend | null = null
  if (sessions.length >= 2) {
    // Sessions arrive newest-first: the front half is "recent", the back half "older".
    const splitAt = Math.ceil(sessions.length / 2)
    const recent = sessions.slice(0, splitAt)
    const older = sessions.slice(splitAt)

    let best: RoleplayTrend | null = null
    for (const key of METRICS) {
      const recentAvg = average(recent.map(s => metricValue(s, key)).filter((v): v is number => v != null))
      const olderAvg = average(older.map(s => metricValue(s, key)).filter((v): v is number => v != null))
      if (recentAvg == null || olderAvg == null) continue

      const rawDelta = (recentAvg - olderAvg) * SCALE[key]
      const delta = Math.round(Math.abs(rawDelta) * 10) / 10
      if (delta < TREND_THRESHOLD) continue
      const improved = HIGHER_IS_BETTER[key] ? rawDelta > 0 : rawDelta < 0

      if (!best || delta > best.delta) {
        best = { metric: key, direction: improved ? 'improving' : 'declining', delta }
      }
    }
    trend = best
  }

  return { count: sessions.length, averages, trend }
}
