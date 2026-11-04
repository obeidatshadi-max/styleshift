import { describe, expect, it } from 'vitest'
import { buildMastermindInsights } from '@/lib/mastermind-coach'
import type { BehavioralGravityResult } from '@/lib/behavioral-gravity'
import type { RoleplaySessionSummary } from '@/types/game'
import {
  buildImprovementReport, buildRoadmap, buildSnapshot, computeEvolution, evaluateFollowup, fromDrillAttempt,
  fromRoleplaySummary, fromScorecard, isValidFieldCheck, latestSnapshot, normalizeRecords,
  type FieldCheck, type Followup, type MetricValues, type PracticeRecord,
} from './index'

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 9)).toISOString()
function rec(id: string, d: number, metrics: MetricValues, over: Partial<PracticeRecord> = {}): PracticeRecord {
  return { id, at: day(d), source: 'ai_doctor', scenarioKey: null, metrics, criticalMoments: null, ...over }
}
const open = (...vals: number[]) => vals.map((v, i) => rec(`s${i}`, i, { open_question_ratio: v }))

describe('measurement consistency', () => {
  const base = [
    rec('a', 0, { open_question_ratio: 50, adaptation_score: 60 }),
    rec('b', 1, { open_question_ratio: 54, adaptation_score: 62 }),
    rec('c', 2, { open_question_ratio: 40, adaptation_score: 70 }),
    rec('d', 3, { open_question_ratio: 38, adaptation_score: 64 }),
  ]

  it('gives identical results whatever order the rows arrive in', () => {
    const shuffled = [base[2], base[0], base[3], base[1]]
    expect(buildSnapshot(shuffled, 'd')).toEqual(buildSnapshot(base, 'd'))
    expect(computeEvolution(shuffled)).toEqual(computeEvolution(base))
  })

  it('keeps one row per id (the latest timestamp wins)', () => {
    const dup = [...base, rec('a', 9, { open_question_ratio: 99 })]
    const out = normalizeRecords(dup)
    expect(out.filter(r => r.id === 'a')).toHaveLength(1)
    expect(out[out.length - 1].id).toBe('a')
  })

  it('compares a session only with strictly earlier sessions of the same source', () => {
    const later = [...base, rec('e', 4, { open_question_ratio: 5 })]
    const before = buildSnapshot(base, 'c')!
    const after = buildSnapshot(later, 'c')!
    expect(after).toEqual(before) // a later session never changes an earlier snapshot
    const mixed = [...base, rec('r', 2.5, { open_question_ratio: 90 }, { source: 'colleague_roleplay' })]
    expect(buildSnapshot(mixed, 'd')!.metrics.find(m => m.key === 'open_question_ratio')!.baseline)
      .toEqual(buildSnapshot(base, 'd')!.metrics.find(m => m.key === 'open_question_ratio')!.baseline)
  })

  it('reads direction correctly: a higher talk ratio is worse, a higher open-question rate is better', () => {
    const talk = [60, 60, 70].map((v, i) => rec(`t${i}`, i, { talk_ratio: v }))
    expect(buildSnapshot(talk, 't2')!.metrics[0]).toMatchObject({ key: 'talk_ratio', baseline: 60, delta: 10, verdict: 'worse' })
    const q = [40, 40, 52].map((v, i) => rec(`q${i}`, i, { open_question_ratio: v }))
    expect(buildSnapshot(q, 'q2')!.metrics[0].verdict).toBe('better')
  })

  it('treats a move below the noise floor as the same', () => {
    expect(buildSnapshot(open(50, 50, 53), 's2')!.metrics[0].verdict).toBe('same')
  })

  it('converts stored 0-1 roleplay ratios to the 0-100 display scale', () => {
    const s: RoleplaySessionSummary = {
      id: 'x', created_at: day(0), duration_sec: 300, talk_ratio: 0.62, question_ratio: 0.3, open_question_ratio: 0.45,
      paraphrase_score: 0.2, active_listening_score: 71, rep_style: null, rep_confidence: null, adaptation_score: null,
    }
    expect(fromRoleplaySummary(s).metrics).toEqual({
      talk_ratio: 62, open_question_ratio: 45, paraphrase_score: 20, active_listening: 71, adaptation_score: null,
    })
  })
})

describe('missing and insufficient data', () => {
  it('skips missing values instead of counting them as zero', () => {
    const rows = [
      rec('a', 0, { open_question_ratio: 60 }), rec('b', 1, { open_question_ratio: null }),
      rec('c', 2, {}), rec('d', 3, { open_question_ratio: Number.NaN }),
      rec('e', 4, { open_question_ratio: 62 }), rec('f', 5, { open_question_ratio: 64 }),
    ]
    const ev = computeEvolution(rows).find(e => e.key === 'open_question_ratio')!
    expect(ev.n).toBe(3)
    expect(ev.trend).toBe('insufficient')
    expect(buildSnapshot(rows, 'f')!.metrics[0]).toMatchObject({ baseline: 61, baselineN: 2 })
  })

  it('says no baseline with fewer than 2 earlier sessions', () => {
    expect(buildSnapshot(open(50, 55), 's1')!.metrics[0].verdict).toBe('no_baseline')
    expect(buildSnapshot(open(50), 's0')!.comparable).toBe(false)
  })

  it('refuses a trend below 4 sessions and asks for more sessions instead of inventing a focus', () => {
    const ev = computeEvolution(open(70, 60, 50))
    expect(ev[0]).toMatchObject({ trend: 'insufficient', confidence: 'insufficient', change: null })
    const road = buildRoadmap(ev, [])
    expect(road.status).toBe('insufficient')
    expect(road.items).toHaveLength(1)
    expect(road.items[0]).toMatchObject({ reason: 'needs_more_data', sessionsNeeded: 1, success: null })
  })

  it('returns no_data for a rep with no sessions', () => {
    expect(buildRoadmap(computeEvolution([]), [])).toEqual({ status: 'no_data', items: [] })
    expect(latestSnapshot([])).toBeNull()
    const r = buildImprovementReport({ records: [], now: new Date(day(10)) })
    expect(r.caveats).toEqual(['no_sessions'])
  })

  it('returns null for a scorecard with no usable signals and null for an unassessed drill score', () => {
    expect(fromScorecard({ session_id: 'z', created_at: day(0), signals: null, adaptation_score: null }, 'doubt')).toBeNull()
    const d = fromDrillAttempt({ drillId: 'd1', drillVersion: 1, repId: 'r', attemptNo: 1, at: day(0), observedBehaviors: [], score: null, passed: false, lang: 'ar' })
    expect(d.metrics.drill_score).toBeNull()
  })

  it('maps an AI-Doctor scorecard to common metrics', () => {
    const r = fromScorecard({
      session_id: 's', created_at: day(0), adaptation_score: 58,
      signals: { repTurnCount: 5, openQuestionRatio: 0.4, clearStepsHitCount: 4, avgRepTurnLength: 80, clearStepsSequence: [] },
    }, 'doubt', 3)!
    expect(r).toMatchObject({ scenarioKey: 'doubt', criticalMoments: 3, metrics: { open_question_ratio: 40, clear_steps_per_turn: 0.8, adaptation_score: 58 } })
  })
})

describe('repeated sessions and trend stability', () => {
  it('compares first and latest attempt of the same scenario', () => {
    const rows = [
      rec('a', 0, { adaptation_score: 50 }, { scenarioKey: 'doubt' }),
      rec('b', 1, { adaptation_score: 80 }, { scenarioKey: 'indifference' }),
      rec('c', 2, { adaptation_score: 58 }, { scenarioKey: 'doubt' }),
      rec('d', 3, { adaptation_score: 66 }, { scenarioKey: 'doubt' }),
    ]
    const ev = computeEvolution(rows).find(e => e.key === 'adaptation_score')!
    expect(ev.repeats).toEqual([{ scenarioKey: 'doubt', n: 3, first: 50, latest: 66, change: 16, verdict: 'better' }])
  })

  it('calls a flat series stable, not improving or declining', () => {
    const ev = computeEvolution(open(50, 52, 49, 51, 50, 52))
    expect(ev[0].trend).toBe('stable')
  })

  it('detects a real decline and marks confidence by number of sessions', () => {
    const emerging = computeEvolution(open(60, 58, 45, 44))[0]
    expect(emerging).toMatchObject({ trend: 'declining', confidence: 'emerging', earlierAvg: 59, recentAvg: 44.5, change: -14.5 })
    const established = computeEvolution(open(62, 60, 61, 59, 45, 44, 43, 42))[0]
    expect(established).toMatchObject({ trend: 'declining', confidence: 'established' })
  })

  it('never pools different sources into one trend', () => {
    const rows = [
      ...open(60, 60, 60, 60),
      ...[20, 20, 20, 20].map((v, i) => rec(`r${i}`, 10 + i, { open_question_ratio: v }, { source: 'colleague_roleplay' })),
    ]
    const ev = computeEvolution(rows)
    expect(ev.map(e => [e.source, e.trend])).toEqual([['ai_doctor', 'stable'], ['colleague_roleplay', 'stable']])
  })
})

describe('recommendation generation', () => {
  const declining = open(62, 60, 61, 59, 45, 44, 43, 42)
  const gravity: BehavioralGravityResult = {
    overallSessionCount: 9, overallWinRate: 66.7,
    patterns: [{
      trigger: 'doubt', metric: 'openQuestionRatio', sessionCount: 4, triggerAvg: 0.2, baselineAvg: 0.45,
      deviationPct: -55.6, winRate: 25, baselineWinRate: 66.7, winRateGapPts: 41.7,
    }],
  }

  it('turns a well-evidenced decline into one precision drill with a checkable success test', () => {
    const road = buildRoadmap(computeEvolution(declining), [])
    expect(road.status).toBe('ready')
    expect(road.items[0]).toMatchObject({
      reason: 'declining', metricKey: 'open_question_ratio', confidence: 'established', tier: 'observed_practice',
      drill: { kind: 'precision_drill', clearStep: 'clarify' },
      success: { metricKey: 'open_question_ratio', minChange: 17, minSessions: 2 },
    })
  })

  it('reuses the Mastermind Coach experiment and collapses duplicates', () => {
    const insights = buildMastermindInsights(gravity, [])
    const road = buildRoadmap([], insights)
    expect(road.items).toHaveLength(1)
    expect(road.items[0]).toMatchObject({
      reason: 'objection_pattern', metricKey: 'open_question_ratio',
      drill: { kind: 'ai_doctor_objection', objectionType: 'doubt', clearStep: 'clarify' },
    })
    const both = buildRoadmap(computeEvolution(declining), insights)
    expect(both.items.map(i => i.reason)).toEqual(['declining', 'objection_pattern']) // different drills, both kept
  })

  it('offers at most 3 items', () => {
    const many = (['open_question_ratio', 'paraphrase_score', 'active_listening', 'adaptation_score'] as const)
      .flatMap((k, j) => [70, 70, 70, 70, 50, 50, 50, 50].map((v, i) => rec(`${k}${i}`, i, { [k]: v - j }, { source: j % 2 ? 'colleague_roleplay' : 'ai_doctor' })))
    expect(buildRoadmap(computeEvolution(many), []).items.length).toBeLessThanOrEqual(3)
  })

  it('suggests nothing when enough data shows no decline', () => {
    expect(buildRoadmap(computeEvolution(open(50, 52, 51, 53, 54, 55)), [])).toEqual({ status: 'ready', items: [] })
  })
})

describe('follow-up status and evidence separation', () => {
  const f: Followup = {
    id: 'f1', repId: 'rep', metricKey: 'open_question_ratio', source: 'ai_doctor', baselineValue: 44,
    createdAt: day(10), dueDate: '2026-10-20', acknowledgedAt: day(11), closedAt: null,
  }
  const now = new Date(day(15))

  it('counts only practice after the assignment and from the same source', () => {
    const rows = [
      rec('old', 5, { open_question_ratio: 90 }),
      rec('rp', 12, { open_question_ratio: 90 }, { source: 'colleague_roleplay' }),
      rec('n1', 12, { open_question_ratio: 50 }),
    ]
    expect(evaluateFollowup(f, rows, [], now).practice).toMatchObject({ status: 'practising', sessionsAfter: 1 })
  })

  it('walks not_started -> improved / no_change / declined', () => {
    expect(evaluateFollowup(f, [], [], now).practice.status).toBe('not_started')
    const mk = (a: number, b: number) => [rec('n1', 12, { open_question_ratio: a }), rec('n2', 13, { open_question_ratio: b })]
    expect(evaluateFollowup(f, mk(52, 56), [], now).practice).toMatchObject({ status: 'improved', afterAvg: 54, change: 10 })
    expect(evaluateFollowup(f, mk(45, 46), [], now).practice.status).toBe('no_change')
    expect(evaluateFollowup(f, mk(30, 34), [], now).practice).toMatchObject({ status: 'declined', change: -12 })
  })

  it('marks overdue once the due date has passed and not before', () => {
    expect(evaluateFollowup(f, [], [], new Date('2026-10-19T10:00:00Z')).overdue).toBe(false)
    expect(evaluateFollowup(f, [], [], new Date('2026-10-21T10:00:00Z')).overdue).toBe(true)
    expect(evaluateFollowup({ ...f, closedAt: day(14) }, [], [], new Date('2026-10-21T10:00:00Z')).overdue).toBe(false)
  })

  const chk = (id: string, kind: FieldCheck['kind'], by: string, observed: FieldCheck['observed']): FieldCheck =>
    ({ id, followupId: 'f1', repId: 'rep', kind, recordedBy: by, observed, at: day(13) })

  it('keeps self-reported and verified field evidence apart and rejects a self-verification', () => {
    const checks = [
      chk('1', 'self_reported', 'rep', 'seen'), chk('2', 'self_reported', 'rep', 'seen'),
      chk('3', 'verified', 'mgr', 'not_seen'),
      chk('4', 'verified', 'rep', 'seen'), // rep "verifying" themselves: rejected
      chk('5', 'self_reported', 'mgr', 'seen'), // manager writing as a self-report: rejected
    ]
    expect(checks.map(isValidFieldCheck)).toEqual([true, true, true, false, false])
    const s = evaluateFollowup(f, [], checks, now)
    expect(s.selfReported).toEqual({ total: 2, seen: 2, notSeen: 0, unclear: 0 })
    expect(s.verified).toEqual({ total: 1, seen: 0, notSeen: 1, unclear: 0 })
    expect(s.rejectedChecks).toBe(2)
    expect(s.practice.status).toBe('not_started') // field entries never move the practice status
  })

  it('ignores field checks that belong to another rep or another follow-up', () => {
    const other: FieldCheck = { ...chk('9', 'verified', 'mgr', 'seen'), repId: 'someone-else' }
    const wrong: FieldCheck = { ...chk('8', 'verified', 'mgr', 'seen'), followupId: 'f2' }
    expect(evaluateFollowup(f, [], [other, wrong], now).verified.total).toBe(0)
  })
})

describe('report accuracy (representative pharma scenarios)', () => {
  // Ali, oncology rep: probes less and less when a consultant voices doubt.
  const oncology = [
    rec('o1', 0, { open_question_ratio: 62, adaptation_score: 66 }, { scenarioKey: 'doubt', criticalMoments: 3 }),
    rec('o2', 1, { open_question_ratio: 60, adaptation_score: 64 }, { scenarioKey: 'indifference', criticalMoments: 4 }),
    rec('o3', 2, { open_question_ratio: 61, adaptation_score: 65 }, { scenarioKey: 'doubt', criticalMoments: 3 }),
    rec('o4', 3, { open_question_ratio: 59, adaptation_score: 63 }, { scenarioKey: 'doubt', criticalMoments: 2 }),
    rec('o5', 4, { open_question_ratio: 45, adaptation_score: 64 }, { scenarioKey: 'doubt', criticalMoments: 5 }),
    rec('o6', 5, { open_question_ratio: 44, adaptation_score: 62 }, { scenarioKey: 'doubt', criticalMoments: 5 }),
    rec('o7', 6, { open_question_ratio: 43, adaptation_score: 65 }, { scenarioKey: 'doubt', criticalMoments: 4 }),
    rec('o8', 7, { open_question_ratio: 42, adaptation_score: 63 }, { scenarioKey: 'doubt', criticalMoments: 6 }),
  ]
  const followup: Followup = {
    id: 'f1', repId: 'rep', metricKey: 'open_question_ratio', source: 'ai_doctor', baselineValue: 43.5,
    createdAt: day(7.5), dueDate: '2026-10-20', acknowledgedAt: null, closedAt: null,
  }
  const after = [
    rec('p1', 9, { open_question_ratio: 55 }, { scenarioKey: 'doubt' }),
    rec('p2', 10, { open_question_ratio: 58 }, { scenarioKey: 'doubt' }),
  ]
  const checks: FieldCheck[] = [
    { id: 'c1', followupId: 'f1', repId: 'rep', kind: 'self_reported', recordedBy: 'rep', observed: 'seen', at: day(11) },
  ]

  it('reports exactly what the data holds and labels what is unverified', () => {
    const r = buildImprovementReport({ records: [...oncology, ...after], followups: [followup], checks, now: new Date(day(12)) })
    expect(r.evidence.observedPractice).toEqual({ sessions: 10, measuredValues: 18 })
    expect(r.evidence.selfReported).toMatchObject({ total: 1, seen: 1 })
    expect(r.evidence.verified.total).toBe(0)
    expect(r.followups[0].practice).toMatchObject({ status: 'improved', sessionsAfter: 2, afterAvg: 56.5, change: 13 })
    expect(r.caveats).toEqual(['self_report_not_verified', 'no_verified_field_evidence'])
    expect(r.snapshot).toMatchObject({ sessionId: 'p2', source: 'ai_doctor' })
    expect(r.roadmap.items[0]).toMatchObject({ metricKey: 'open_question_ratio' })
  })

  it('adds a verified manager observation without changing the practice or self-reported numbers', () => {
    const base = buildImprovementReport({ records: [...oncology, ...after], followups: [followup], checks, now: new Date(day(12)) })
    const verified: FieldCheck = { id: 'c2', followupId: 'f1', repId: 'rep', kind: 'verified', recordedBy: 'mgr', observed: 'seen', at: day(12) }
    const r = buildImprovementReport({ records: [...oncology, ...after], followups: [followup], checks: [...checks, verified], now: new Date(day(12)) })
    expect(r.evidence.verified).toMatchObject({ total: 1, seen: 1 })
    expect(r.evidence.selfReported).toEqual(base.evidence.selfReported)
    expect(r.followups[0].practice).toEqual(base.followups[0].practice)
    expect(r.caveats).toEqual([]) // 1 self-report, 1 manager confirmation: nothing left unverified
  })

  it('keeps the unverified caveat while self-reports outnumber confirmations', () => {
    const two: FieldCheck = { id: 'c9', followupId: 'f1', repId: 'rep', kind: 'self_reported', recordedBy: 'rep', observed: 'seen', at: day(12) }
    const verified: FieldCheck = { id: 'c2', followupId: 'f1', repId: 'rep', kind: 'verified', recordedBy: 'mgr', observed: 'seen', at: day(12) }
    const r = buildImprovementReport({ records: [...oncology, ...after], followups: [followup], checks: [...checks, two, verified], now: new Date(day(12)) })
    expect(r.caveats).toEqual(['self_report_not_verified'])
  })

  it('flags a brand-new rep: one session, nothing comparable, no focus invented', () => {
    const r = buildImprovementReport({ records: [oncology[0]], now: new Date(day(1)) })
    expect(r.caveats).toEqual(['few_sessions', 'no_comparison_yet'])
    expect(r.roadmap.status).toBe('insufficient')
  })
})
