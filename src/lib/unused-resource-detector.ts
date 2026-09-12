import { CLEAR_STEPS, type ClearStep, type ObjectionType } from '@/lib/voice-partner-core'

// Phase 5 ("Behavioral Pattern Intelligence" — docs/ai-doctor-phase-1-plan.md's
// Deferred list, docs/ai-doctor-gap-analysis.md's "Unused Resource Detector"
// row: "no per-context capability comparison"). Same no-external-spec caveat
// as behavioral-gravity.ts — this module's reading of the name: a rep who has
// PROVEN they can execute a given CLEAR step (they demonstrably use it, often,
// against one kind of objection) but barely uses it against a DIFFERENT kind
// of objection has an "unused resource" — a real, demonstrated capability
// sitting idle in contexts where it would plausibly help just as much. This
// is deliberately NOT "the rep never learned X" (that's a competency gap,
// already covered by Phase 2's CompetencyEvaluator) — it is specifically
// "the rep already CAN do X, just doesn't reach for it here," which is a
// different and cheaper coaching fix (a nudge/reminder, not new training).
//
// FLAGGED DECISION: contexts are keyed by objection_type (same choice, and
// same reasoning, as behavioral-gravity.ts — the stable existing categorical
// signal, deliberately not yet unified with company-scenario's separate
// 7-category taxonomy per the 2026-09-11 deferral).
//
// FLAGGED DECISION: no new table/migration — reads `session_scorecards.
// signals.clearStepsSequence` (already persisted per session since Phase 2)
// joined with `voice_partner_sessions.objection_type`, computed live at read
// time. Same reasoning as behavioral-gravity.ts.

export interface CapabilityUsageRow {
  sessionId: string
  objectionType: ObjectionType
  /** Distinct CLEAR steps hit at least once this session — same shape as
   * SessionSignals.clearStepsSequence (session-evaluator.ts). */
  clearStepsHit: ClearStep[]
}

export interface UnusedResourceFinding {
  step: ClearStep
  provenContext: ObjectionType
  provenRate: number
  provenSessionCount: number
  underusedContext: ObjectionType
  underusedRate: number
  underusedSessionCount: number
}

// DECISION (flagged, tunable, unvalidated against real data): a context needs
// at least this many sessions before its usage rate for a given step is
// treated as a real pattern rather than a single session's coincidence.
const MIN_SESSIONS_PER_CONTEXT = 3

// The step must be hit in at least this fraction of sessions in some context
// to count as "proven" (a demonstrated, reliable capability there).
const PROVEN_RATE_THRESHOLD = 0.6

// ...and hit in at most this fraction of sessions in a DIFFERENT context
// (with its own minimum session count) to count as "underused" there.
const UNDERUSED_RATE_THRESHOLD = 0.2

function usageRate(rows: CapabilityUsageRow[], step: ClearStep): number {
  if (!rows.length) return 0
  return rows.filter(r => r.clearStepsHit.includes(step)).length / rows.length
}

/**
 * For each CLEAR step, finds an objection-type context where the rep
 * reliably uses it (>= PROVEN_RATE_THRESHOLD, with enough sessions to trust
 * the rate) and a DIFFERENT context where they rarely do
 * (<= UNDERUSED_RATE_THRESHOLD, also with enough sessions) — i.e. a real,
 * demonstrated capability that sits unused in a context where the rep has
 * had real opportunities to use it. Returns one finding per step at most
 * (the single most-proven vs. single most-underused context pairing),
 * sorted by the size of the proven-vs-underused gap, largest first. A step
 * with no context reaching the proven threshold, or no OTHER context both
 * below the underused threshold AND meeting the minimum-session bar, is
 * silently skipped rather than reported with a thin/fabricated comparison.
 */
export function detectUnusedResources(rows: CapabilityUsageRow[]): UnusedResourceFinding[] {
  const byContext = new Map<ObjectionType, CapabilityUsageRow[]>()
  for (const row of rows) {
    const list = byContext.get(row.objectionType) ?? []
    list.push(row)
    byContext.set(row.objectionType, list)
  }
  const eligibleContexts = [...byContext.entries()].filter(([, list]) => list.length >= MIN_SESSIONS_PER_CONTEXT)
  if (eligibleContexts.length < 2) return []

  const findings: UnusedResourceFinding[] = []
  for (const step of CLEAR_STEPS) {
    const rates = eligibleContexts.map(([context, list]) => ({
      context, sessionCount: list.length, rate: usageRate(list, step),
    }))

    const proven = rates.filter(r => r.rate >= PROVEN_RATE_THRESHOLD).sort((a, b) => b.rate - a.rate)[0]
    if (!proven) continue

    const underused = rates
      .filter(r => r.context !== proven.context && r.rate <= UNDERUSED_RATE_THRESHOLD)
      .sort((a, b) => a.rate - b.rate)[0]
    if (!underused) continue

    findings.push({
      step,
      provenContext: proven.context, provenRate: Math.round(proven.rate * 1000) / 10, provenSessionCount: proven.sessionCount,
      underusedContext: underused.context, underusedRate: Math.round(underused.rate * 1000) / 10, underusedSessionCount: underused.sessionCount,
    })
  }

  findings.sort((a, b) => (b.provenRate - b.underusedRate) - (a.provenRate - a.underusedRate))
  return findings
}
