import type { ObjectionType } from '@/lib/voice-partner-core'

// Phase 5 ("Behavioral Pattern Intelligence" — docs/ai-doctor-phase-1-plan.md's
// Deferred list, docs/ai-doctor-gap-analysis.md's "Behavioral Gravity" row).
//
// SCOPE DECISION: "Behavioral Gravity" has no detailed external spec captured
// in the repo docs (unlike Phase 1, which had a full written plan) — the
// gap-analysis row says only: extend roleplay-aggregate.ts's cross-session
// trend logic with a "trigger -> response -> consequence" structure.
// roleplay-aggregate.ts's existing trend (recent-half vs older-half, single
// most-notable metric) answers "is this rep getting better or worse overall"
// but never asks WHY — it has no notion of a trigger. This module's reading
// of "trigger -> response -> consequence": the TRIGGER is the specific
// objection type a session's doctor raised (the one categorical signal that
// already exists on every AI-Doctor session via `voice_partner_sessions`,
// unlike a pressure moment which only ~some sessions have); the RESPONSE is
// how the rep's observable behavior (turn length, open-question rate, CLEAR
// step usage) shifts specifically under THAT trigger vs. their own baseline
// across every trigger; the CONSEQUENCE is whether that shifted behavior
// correlates with a worse outcome (lower win rate, lower adaptation score)
// for that trigger specifically. A "gravity pattern" is a trigger the rep
// keeps getting pulled into a particular (measurably different) response by,
// where that pull correlates with worse results — i.e. a recurring, not
// one-off, maladaptive reaction to a specific kind of pressure.
//
// FLAGGED DECISION: objection_type was chosen over doctor style or difficulty
// as the trigger dimension because it is the most stable, already-typed
// categorical value recorded on every session (`voice_partner_sessions.
// objection_type`), and because unifying it with the OTHER objection
// taxonomy (company-scenario's 7-category ObjectionCategory) was explicitly
// deferred until Phase 5 needed real pattern data to justify a merge
// direction (project memory, 2026-09-11) — this module is that consumer, but
// still does NOT perform the unification itself; it only groups by the
// existing 5-type ObjectionType until real usage data across BOTH taxonomies
// exists to inform how they'd actually merge. Doctor style / difficulty as
// alternative trigger dimensions were not built now — flagged as a possible
// v2 grouping once this v1 (objection-type-triggered) reading proves useful
// or not against real sessions.
//
// FLAGGED DECISION: no new table/migration. This is computed LIVE, at read
// time, from the rep's existing `voice_partner_sessions` + `session_scorecards`
// rows joined by session_id — the same "no cron/materialized cache" pattern
// already established by Team Pulse and Champions/Leagues in this app
// (`team-pulse.ts`, `champions.ts`). A cross-session insight recomputed on
// every view is cheap here (a rep's total session count is small) and avoids
// staging a schema for a shape that might be wrong before any real session
// data exists to validate the trigger/threshold choices below.

export type GravityMetricKey = 'avgRepTurnLength' | 'openQuestionRatio' | 'clearStepsPerTurn'

const METRICS: GravityMetricKey[] = ['avgRepTurnLength', 'openQuestionRatio', 'clearStepsPerTurn']

// A higher value is not universally "better" for every metric (same caveat
// roleplay-aggregate.ts documents for talk_ratio) — Behavioral Gravity does
// NOT judge direction as good/bad on its own; it only flags that behavior
// measurably DIFFERS under a trigger AND that difference correlates with a
// worse outcome. The consequence (win rate) is what carries the judgment,
// not the metric's direction.

export interface GravitySessionRow {
  sessionId: string
  objectionType: ObjectionType
  outcome: 'won' | 'escalated'
  adaptationScore: number | null
  avgRepTurnLength: number
  openQuestionRatio: number
  /** Distinct CLEAR steps hit this session, divided by rep turn count — same
   * shape as pressure-shift.ts's WindowMetrics.clearStepsPerTurn, computed
   * the same way (clearStepsHitCount / repTurnCount) so both modules read
   * consistently off session_scorecards.signals. */
  clearStepsPerTurn: number
}

export interface GravityPattern {
  trigger: ObjectionType
  metric: GravityMetricKey
  sessionCount: number
  triggerAvg: number
  baselineAvg: number
  /** (triggerAvg - baselineAvg) / baselineAvg, as a percentage; sign
   * indicates direction of the shift, not good/bad. */
  deviationPct: number
  winRate: number
  baselineWinRate: number
  /** Percentage points: baselineWinRate - winRate (positive = this trigger
   * correlates with a worse outcome than the rep's overall average). Only
   * patterns with a positive gap past MIN_WINRATE_GAP are ever returned —
   * see computeBehavioralGravity. */
  winRateGapPts: number
}

export interface BehavioralGravityResult {
  overallSessionCount: number
  overallWinRate: number
  /** Sorted by winRateGapPts descending (worst-correlated pattern first). */
  patterns: GravityPattern[]
}

// DECISION (flagged, tunable, unvalidated against real data — none exists
// yet, feature only activated in prod 2026-09-12): a trigger group needs at
// least this many sessions before its average is treated as a real pattern
// rather than one or two noisy sessions. Mirrors pressure-shift.ts's
// "don't compare against a fabricated/thin baseline" principle.
const MIN_TRIGGER_SESSIONS = 3

// A trigger group's metric average must differ from the rep's own overall
// baseline by at least this fraction to count as a real behavioral shift
// (not display noise) — 0.2 = 20%.
const MIN_DEVIATION_FRACTION = 0.2

// The trigger group's win rate must be at least this many percentage points
// BELOW the rep's overall win rate to count as a real (not coincidental)
// worse consequence.
const MIN_WINRATE_GAP_PTS = 15

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function metricValue(row: GravitySessionRow, key: GravityMetricKey): number {
  switch (key) {
    case 'avgRepTurnLength': return row.avgRepTurnLength
    case 'openQuestionRatio': return row.openQuestionRatio
    case 'clearStepsPerTurn': return row.clearStepsPerTurn
  }
}

function winRate(rows: GravitySessionRow[]): number {
  if (!rows.length) return 0
  return rows.filter(r => r.outcome === 'won').length / rows.length
}

/**
 * Groups a rep's AI-Doctor session history by the objection type each
 * session's doctor raised, then — for every trigger group with enough
 * sessions — compares that group's behavior (turn length / open-question
 * rate / CLEAR-steps-per-turn) and win rate against the rep's own overall
 * baseline across every session. Returns null when there isn't enough
 * history at all yet (fewer than MIN_TRIGGER_SESSIONS sessions total —
 * nothing to compare against a baseline of itself). A pattern is only
 * surfaced when BOTH a real behavioral deviation (>= MIN_DEVIATION_FRACTION)
 * AND a real worse-consequence gap (>= MIN_WINRATE_GAP_PTS) are present —
 * surfacing a deviation alone (e.g. "you talk more under doubt objections")
 * without a worse outcome attached isn't a coaching-worthy "gravity" pattern,
 * just a stylistic difference.
 */
export function computeBehavioralGravity(rows: GravitySessionRow[]): BehavioralGravityResult | null {
  if (rows.length < MIN_TRIGGER_SESSIONS) return null

  const overallWinRate = winRate(rows)
  const baseline: Partial<Record<GravityMetricKey, number>> = {}
  for (const key of METRICS) {
    const avg = average(rows.map(r => metricValue(r, key)))
    if (avg != null) baseline[key] = avg
  }

  const groups = new Map<ObjectionType, GravitySessionRow[]>()
  for (const row of rows) {
    const list = groups.get(row.objectionType) ?? []
    list.push(row)
    groups.set(row.objectionType, list)
  }

  const patterns: GravityPattern[] = []
  for (const [trigger, groupRows] of groups) {
    if (groupRows.length < MIN_TRIGGER_SESSIONS) continue
    const groupWinRate = winRate(groupRows)
    const winRateGapPts = Math.round((overallWinRate - groupWinRate) * 1000) / 10
    if (winRateGapPts < MIN_WINRATE_GAP_PTS) continue

    let best: GravityPattern | null = null
    for (const key of METRICS) {
      const baselineAvg = baseline[key]
      if (baselineAvg == null || baselineAvg === 0) continue
      const triggerAvg = average(groupRows.map(r => metricValue(r, key)))
      if (triggerAvg == null) continue
      const deviationFraction = (triggerAvg - baselineAvg) / baselineAvg
      if (Math.abs(deviationFraction) < MIN_DEVIATION_FRACTION) continue

      const candidate: GravityPattern = {
        trigger, metric: key, sessionCount: groupRows.length,
        triggerAvg: Math.round(triggerAvg * 100) / 100,
        baselineAvg: Math.round(baselineAvg * 100) / 100,
        deviationPct: Math.round(deviationFraction * 1000) / 10,
        winRate: Math.round(groupWinRate * 1000) / 10,
        baselineWinRate: Math.round(overallWinRate * 1000) / 10,
        winRateGapPts,
      }
      // One pattern per trigger (the metric with the largest absolute
      // deviation) — reporting all 3 metrics for the same trigger would
      // just be noise; the rep needs the single clearest signal per trigger.
      if (!best || Math.abs(deviationFraction) > Math.abs((best.triggerAvg - best.baselineAvg) / best.baselineAvg)) {
        best = candidate
      }
    }
    if (best) patterns.push(best)
  }

  patterns.sort((a, b) => b.winRateGapPts - a.winRateGapPts)

  return {
    overallSessionCount: rows.length,
    overallWinRate: Math.round(overallWinRate * 1000) / 10,
    patterns,
  }
}
