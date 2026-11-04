import { METRICS, improvement, mean, normalizeRecords, round1, series, type MetricKey, type PracticeRecord } from './metrics'
import { MIN_SESSIONS_AFTER } from './roadmap'

// Manager assignment + follow-up. A follow-up is a roadmap item a manager has put
// in front of one rep. Its status is judged from THREE separate evidence streams:
//   practice  - sessions StyleShift measured after the assignment (observed_practice)
//   self      - the rep says it happened in a real visit (self_reported)
//   verified  - someone other than the rep saw it in the field (verified_field)
// They are reported side by side and are never added together.

export interface Followup {
  id: string
  repId: string
  metricKey: MetricKey | null
  source: PracticeRecord['source'] | null
  /** Value at assignment time (mean of the last sessions then); null when there was no baseline. */
  baselineValue: number | null
  createdAt: string
  dueDate: string | null
  acknowledgedAt: string | null
  closedAt: string | null
}

export type FieldObservation = 'seen' | 'not_seen' | 'unclear'

export interface FieldCheck {
  id: string
  followupId: string
  repId: string
  kind: 'self_reported' | 'verified'
  /** Who wrote the entry. A verified entry must come from someone other than the rep. */
  recordedBy: string
  observed: FieldObservation
  at: string
}

/** Self-reports must be by the rep; verifications must be by someone else. Anything else is rejected. */
export function isValidFieldCheck(c: FieldCheck): boolean {
  return c.kind === 'self_reported' ? c.recordedBy === c.repId : c.recordedBy !== c.repId
}

export type PracticeStatus = 'closed' | 'not_started' | 'practising' | 'improved' | 'no_change' | 'declined' | 'no_baseline'

export interface FieldTally { total: number; seen: number; notSeen: number; unclear: number }

export interface FollowupStatus {
  followupId: string
  practice: {
    status: PracticeStatus
    sessionsAfter: number
    afterAvg: number | null
    /** Direction-adjusted: positive = better than the baseline. */
    change: number | null
  }
  selfReported: FieldTally
  verified: FieldTally
  /** Field entries ignored because their author did not fit their kind. */
  rejectedChecks: number
  overdue: boolean
  acknowledged: boolean
}

function tally(checks: FieldCheck[]): FieldTally {
  const t: FieldTally = { total: 0, seen: 0, notSeen: 0, unclear: 0 }
  for (const c of checks) {
    t.total++
    if (c.observed === 'seen') t.seen++
    else if (c.observed === 'not_seen') t.notSeen++
    else t.unclear++
  }
  return t
}

export function evaluateFollowup(
  f: Followup, records: readonly PracticeRecord[], checks: readonly FieldCheck[], now: Date,
): FollowupStatus {
  const since = Date.parse(f.createdAt)
  const after = normalizeRecords(records).filter(r =>
    Date.parse(r.at) > since && (f.source === null || r.source === f.source))
  const values = f.metricKey ? series(after, f.metricKey) : []

  let status: PracticeStatus
  let afterAvg: number | null = null
  let change: number | null = null
  if (f.closedAt) status = 'closed'
  else if (after.length === 0) status = 'not_started'
  else if (!f.metricKey || values.length < MIN_SESSIONS_AFTER) status = 'practising'
  else {
    afterAvg = round1(mean(values.map(v => v.value)))
    if (f.baselineValue === null) status = 'no_baseline'
    else {
      change = round1(improvement(f.metricKey, afterAvg - f.baselineValue))
      status = Math.abs(change) < METRICS[f.metricKey].minDelta ? 'no_change' : change > 0 ? 'improved' : 'declined'
    }
  }

  const mine = checks.filter(c => c.followupId === f.id && c.repId === f.repId)
  const valid = mine.filter(isValidFieldCheck)
  return {
    followupId: f.id,
    practice: { status, sessionsAfter: f.metricKey ? values.length : after.length, afterAvg, change },
    selfReported: tally(valid.filter(c => c.kind === 'self_reported')),
    verified: tally(valid.filter(c => c.kind === 'verified')),
    rejectedChecks: mine.length - valid.length,
    overdue: !f.closedAt && !!f.dueDate && Date.parse(f.dueDate + 'T23:59:59Z') < now.getTime(),
    acknowledged: !!f.acknowledgedAt,
  }
}
