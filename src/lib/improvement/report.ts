import type { MastermindInsight } from '@/lib/mastermind-coach'
import { METRIC_KEYS, normalizeRecords, series, type PracticeRecord } from './metrics'
import { latestSnapshot, type ConversationSnapshot } from './snapshot'
import { computeEvolution, type MetricEvolution } from './evolution'
import { buildRoadmap, type Roadmap } from './roadmap'
import { evaluateFollowup, type FieldCheck, type FieldTally, type Followup, type FollowupStatus } from './followup'

// One report, three evidence tiers, no blended score. `caveats` are codes the UI
// turns into plain language so an uncertain or thin result is always labelled.

export type Caveat =
  | 'no_sessions' | 'few_sessions' | 'no_comparison_yet'
  | 'self_report_not_verified' | 'no_verified_field_evidence' | 'check_rejected'

export interface ImprovementReport {
  generatedAt: string
  snapshot: ConversationSnapshot | null
  evolution: MetricEvolution[]
  roadmap: Roadmap
  followups: FollowupStatus[]
  evidence: {
    observedPractice: { sessions: number; measuredValues: number }
    selfReported: FieldTally
    verified: FieldTally
  }
  caveats: Caveat[]
}

const zero = (): FieldTally => ({ total: 0, seen: 0, notSeen: 0, unclear: 0 })
const add = (a: FieldTally, b: FieldTally): FieldTally => ({
  total: a.total + b.total, seen: a.seen + b.seen, notSeen: a.notSeen + b.notSeen, unclear: a.unclear + b.unclear,
})

export function buildImprovementReport(input: {
  records: readonly PracticeRecord[]
  insights?: readonly MastermindInsight[]
  followups?: readonly Followup[]
  checks?: readonly FieldCheck[]
  now: Date
}): ImprovementReport {
  const records = normalizeRecords(input.records)
  const evolution = computeEvolution(records)
  const followups = (input.followups ?? []).map(f => evaluateFollowup(f, records, input.checks ?? [], input.now))
  const selfReported = followups.reduce((t, f) => add(t, f.selfReported), zero())
  const verified = followups.reduce((t, f) => add(t, f.verified), zero())
  const snapshot = latestSnapshot(records)

  const caveats: Caveat[] = []
  if (records.length === 0) caveats.push('no_sessions')
  else if (records.length < 4) caveats.push('few_sessions')
  if (snapshot && !snapshot.comparable) caveats.push('no_comparison_yet')
  // Only while the rep has reported more than managers have confirmed.
  if (selfReported.total > verified.total) caveats.push('self_report_not_verified')
  if (followups.length > 0 && verified.total === 0) caveats.push('no_verified_field_evidence')
  if (followups.some(f => f.rejectedChecks > 0)) caveats.push('check_rejected')

  return {
    generatedAt: input.now.toISOString(),
    snapshot, evolution, roadmap: buildRoadmap(evolution, input.insights ?? []), followups,
    evidence: {
      observedPractice: { sessions: records.length, measuredValues: METRIC_KEYS.reduce((n, k) => n + series(records, k).length, 0) },
      selfReported, verified,
    },
    caveats,
  }
}
