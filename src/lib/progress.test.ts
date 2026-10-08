import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRealSession, progressReport, PROGRESS_RULES, type ProgressInput } from '@/lib/progress'
import { loadProgress } from '@/lib/progress-load'
import { createEmptySession } from '@/schemas/session/factory'
import type { StyleShiftSession } from '@/schemas/session'
import type { SessionScore } from '@/schemas/scoring'
import type { DrillAttempt } from '@/schemas/drill'
import type { CapabilityReport } from '@/lib/capability-iq'

const NOW = new Date('2026-10-08T12:00:00Z') // a Thursday; this week started Monday 2026-10-05
const at = (daysAgo: number, hour = 10) => { const d = new Date(NOW.getTime() - daysAgo * 86_400_000); d.setUTCHours(hour, 0, 0, 0); return d.toISOString() }
let n = 0

function session(daysAgo: number, o: { overall?: number; style?: 'driver' | 'analytical' | 'amiable' | 'expressive' | null; hurt?: string[]; repTurns?: number; coverage?: number; ended?: boolean } = {}): StyleShiftSession {
  const s = createEmptySession(`s${n++}`, 'rep-1')
  if (o.ended !== false) s.endedAt = at(daysAgo)
  s.socialStyle.dominant = o.style === undefined ? 'analytical' : o.style
  const turns = o.repTurns ?? 4
  s.transcript = Array.from({ length: turns }, (_, i) => ({ turnIndex: i, role: 'rep' as const, text: `turn ${i}`, objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }))
  const empty = { score: null, reason: 'insufficient_evidence' as const, observationsUsed: 0, contributions: [] }
  s.scores = {
    competencies: { questioning: empty, active_listening: empty, adaptation: empty, objection_handling: empty, value_communication: empty, closing: empty,
      discovery: { score: 50, reason: 'scored', observationsUsed: 1, contributions: (o.hurt ?? []).map(b => ({ behavior: b, direction: 'negative', confidence: 0.9, points: -5, evidenceTurns: [0] })) } },
    overall: o.overall ?? 60, coverage: o.coverage ?? 0.5, configVersion: 'x', scoredAt: 'x',
  } as SessionScore
  return s
}
const attempt = (drillId: string, daysAgo: number, score: number | null, passed = (score ?? 0) >= 60, hour = 10): DrillAttempt =>
  ({ drillId, drillVersion: 1, repId: 'rep-1', attemptNo: 1, at: at(daysAgo, hour), observedBehaviors: [], score, passed, lang: 'en' })
const run = (over: Partial<ProgressInput> = {}) => progressReport({ sessions: [], attempts: [], drillTypeOf: id => ({ 'pq-1': 'precision_questioning', 'cl-1': 'clarification' } as Record<string, string>)[id], now: NOW, ...over })

describe('what counts as real practice', () => {
  it('needs an ended, scored session with enough rep turns', () => {
    expect(isRealSession(session(1))).toBe(true)
    expect(isRealSession(session(1, { repTurns: PROGRESS_RULES.minRepTurns - 1 }))).toBe(false)
    expect(isRealSession(session(1, { coverage: 0 }))).toBe(false)
    expect(isRealSession(session(1, { ended: false }))).toBe(false)
  })
})

describe('volume cannot move anything', () => {
  it('counts a day once however many sessions and attempts it holds', () => {
    const spam = run({ sessions: Array.from({ length: 20 }, () => session(0)), attempts: Array.from({ length: 20 }, () => attempt('pq-1', 0, 90)) })
    expect(spam.week).toMatchObject({ days: 1, met: false })
    expect(spam.streak.weeks).toBe(0)
    expect(spam.totals.practiceDays).toBe(1)
  })

  it('ignores tiny or unscored sessions and unassessed attempts entirely', () => {
    const r = run({ sessions: [session(0, { repTurns: 1 }), session(1, { coverage: 0 })], attempts: [attempt('pq-1', 2, null)] })
    expect(r.totals).toEqual({ sessions: 0, practiceDays: 0, drillsPassedDays: 0 })
  })

  it('does not read improvement from retrying the same drill within one day', () => {
    const grind = [20, 40, 60, 80, 95].map(s => attempt('pq-1', 1, s))
    const r = run({ attempts: grind })
    expect(r.drills[0].improvement).toBeNull()
    expect(r.drills[0].assessedDays).toBe(1)
    expect(r.drills[0].mastery).toBe('practising')
  })
})

describe('weekly rhythm and streak', () => {
  const daysThisWeek = (k: number) => Array.from({ length: k }, (_, i) => session(i)) // today, 1 and 2 days ago = Thu, Wed, Tue

  it('counts distinct practice days this week against the target', () => {
    expect(run({ sessions: daysThisWeek(2) }).week).toMatchObject({ days: 2, target: 3, met: false, startsOn: '2026-10-05' })
    expect(run({ sessions: daysThisWeek(3) }).week).toMatchObject({ days: 3, met: true })
  })

  it('builds a streak of consecutive weeks that met the target; the current week never breaks it', () => {
    const week = (startDaysAgo: number) => [0, 1, 2].map(i => session(startDaysAgo + i))
    // this week unmet (1 day), last two weeks met
    const r = run({ sessions: [session(0), ...week(7), ...week(14)] })
    expect(r.streak.weeks).toBe(2)
    expect(run({ sessions: [...daysThisWeek(3), ...week(7)] }).streak.weeks).toBe(2) // met this week too
  })

  it('a missed week resets the streak, but the best run is kept', () => {
    const week = (startDaysAgo: number) => [0, 1, 2].map(i => session(startDaysAgo + i))
    const r = run({ sessions: [...week(7), ...week(21), ...week(28), ...week(35)] }) // met 1, 3, 4, 5 weeks ago; 2 weeks ago missed
    expect(r.streak.weeks).toBe(1)
    expect(r.streak.bestWeeks).toBe(3)
  })

  it('mixes sessions and drills as separate practice days', () => {
    const r = run({ sessions: [session(0)], attempts: [attempt('pq-1', 1, 70), attempt('cl-1', 2, 70)] })
    expect(r.week.days).toBe(3)
  })

  it('follows the rep\'s local day, not UTC', () => {
    const late = [session(0)]; late[0].endedAt = '2026-10-08T22:30:00Z'
    const utc = run({ sessions: late }), baghdad = run({ sessions: late, tzOffsetMin: 180 })
    expect(utc.week.days).toBe(1)
    expect(baghdad.week.days).toBe(1) // 01:30 on the 9th local, still this week
    const edge = [session(0)]; edge[0].endedAt = '2026-10-04T22:30:00Z' // Sunday UTC, Monday 01:30 in Baghdad
    expect(run({ sessions: edge, now: new Date('2026-10-05T12:00:00Z') }).week.days).toBe(0)
    expect(run({ sessions: edge, now: new Date('2026-10-05T12:00:00Z'), tzOffsetMin: 180 }).week.days).toBe(1)
  })
})

describe('skill mastery and improvement', () => {
  it('moves from practising to proficient to mastered only on passes across different days', () => {
    expect(run({ attempts: [attempt('pq-1', 3, 50, false)] }).drills[0].mastery).toBe('practising')
    expect(run({ attempts: [attempt('pq-1', 3, 72), attempt('pq-1', 1, 75)] }).drills[0].mastery).toBe('proficient')
    expect(run({ attempts: [attempt('pq-1', 5, 82), attempt('pq-1', 3, 85), attempt('pq-1', 1, 90)] }).drills[0].mastery).toBe('mastered')
    expect(run({ attempts: [attempt('pq-1', 5, 82), attempt('pq-1', 3, 85), attempt('pq-1', 1, 62)] }).drills[0].mastery).toBe('proficient') // latest mean < 80
    expect(run({ attempts: [attempt('pq-1', 5, 82), attempt('pq-1', 3, 85), attempt('pq-1', 1, 50, false)] }).drills[0].mastery).toBe('proficient') // latest not passed
  })

  it('reports improvement only over enough days and span, rounded to a step', () => {
    const grow = [attempt('pq-1', 27, 50), attempt('pq-1', 20, 55), attempt('pq-1', 8, 62), attempt('pq-1', 1, 68)]
    const r = run({ attempts: grow }).drills[0]
    expect(r.improvement).toMatchObject({ direction: 'improved', overDays: 26 })
    expect(r.improvement!.percent % PROGRESS_RULES.percentStep).toBe(0)
    expect(r.improvement!.percent).toBe(25) // (65 - 52.5) / 52.5 = 23.8% -> 25
    expect(run({ attempts: grow.slice(0, 2) }).drills[0].improvement).toBeNull() // two days: not enough
    expect(run({ attempts: [attempt('pq-1', 5, 50), attempt('pq-1', 4, 60), attempt('pq-1', 3, 70)] }).drills[0].improvement).toBeNull() // too short a span
  })

  it('shows a decline as a decline and flat as steady', () => {
    const fall = run({ attempts: [attempt('pq-1', 27, 80), attempt('pq-1', 20, 78), attempt('pq-1', 8, 60), attempt('pq-1', 1, 55)] }).drills[0].improvement
    expect(fall?.direction).toBe('declined')
    const flat = run({ attempts: [attempt('pq-1', 27, 70), attempt('pq-1', 20, 71), attempt('pq-1', 8, 70), attempt('pq-1', 1, 72)] }).drills[0].improvement
    expect(flat?.direction).toBe('steady')
  })

  it('tracks best score and date, and keeps drill types separate', () => {
    const r = run({ attempts: [attempt('pq-1', 4, 70), attempt('pq-1', 2, 88), attempt('cl-1', 1, 60)] })
    expect(r.drills.map(d => d.type)).toEqual(['clarification', 'precision_questioning'])
    expect(r.drills[1]).toMatchObject({ best: 88, bestOn: '2026-10-06' })
  })

  it('ignores attempts at drills it cannot place', () => {
    expect(run({ attempts: [attempt('mystery', 1, 90)] }).drills).toEqual([])
  })
})

describe('personal best by physician style', () => {
  it('is reported only for a current best, with enough sessions with that style', () => {
    const analytical = (d: number, overall: number) => session(d, { style: 'analytical', overall })
    expect(run({ sessions: [analytical(0, 80), analytical(3, 60), analytical(6, 55)] }).styleBests).toEqual([{ style: 'analytical', sessions: 3, best: 80, on: '2026-10-08' }])
    expect(run({ sessions: [analytical(0, 60), analytical(3, 62), analytical(6, 90)] }).styleBests).toEqual([]) // best was long ago
    expect(run({ sessions: [analytical(0, 80), analytical(3, 60)] }).styleBests).toEqual([]) // too few sessions
    expect(run({ sessions: [analytical(0, 80), analytical(3, 80), analytical(6, 55)] }).styleBests).toEqual([]) // tied, not a new best
  })
})

describe('clean runs on behaviors that used to hurt', () => {
  const hist = (hurtFlags: boolean[]) => hurtFlags.map((h, i) => session(i, { hurt: h ? ['premature_pitch'] : [] })) // index 0 = newest

  it('reports a run only after the behavior has actually been a problem', () => {
    expect(run({ sessions: hist([false, false, false, true, true]) }).cleanRuns).toEqual([{ behavior: 'premature_pitch', sessions: 3 }])
    expect(run({ sessions: hist([false, false, false, false, false]) }).cleanRuns).toEqual([]) // never a problem
    expect(run({ sessions: hist([false, false, true, true, true]) }).cleanRuns).toEqual([]) // run too short
    expect(run({ sessions: hist([false, false, false, true]) }).cleanRuns).toEqual([]) // only one earlier problem
    expect(run({ sessions: hist([true, false, false, false, true, true]) }).cleanRuns).toEqual([]) // broken just now
  })
})

describe('capability progression and milestones', () => {
  const cap = (trend: 'improving' | 'stable', status: 'scored' | 'insufficient_evidence' = 'scored') => ({
    configVersion: 'x', sessionsConsidered: 5,
    dimensions: Object.fromEntries(['interaction', 'clinical', 'adaptation', 'discovery', 'commitment'].map(d => [d, d === 'discovery'
      ? (status === 'scored' ? { dimension: d, status, trend, score: 60, band: 'strong', confidence: 'medium', eventsUsed: 5, sessionsUsed: 3, limit: null, evidence: { helped: [], hurt: [] } } : { dimension: d, status, eventsUsed: 1, sessionsUsed: 1, limit: null, needed: { events: 3, sessions: 2 } })
      : { dimension: d, status: 'insufficient_evidence', eventsUsed: 0, sessionsUsed: 0, limit: null, needed: { events: 3, sessions: 2 } }])),
  }) as unknown as CapabilityReport

  it('lists only scored dimensions that are improving', () => {
    expect(run({ capability: cap('improving') }).improvingCapabilities).toEqual(['discovery'])
    expect(run({ capability: cap('stable') }).improvingCapabilities).toEqual([])
    expect(run({ capability: cap('improving', 'insufficient_evidence') }).improvingCapabilities).toEqual([])
    expect(run().improvingCapabilities).toEqual([])
  })

  it('derives milestones from history, not from counters', () => {
    expect(run().milestones).toEqual([])
    const ids = (r: ReturnType<typeof run>) => r.milestones.map(m => m.id + (m.param ? `:${m.param}` : ''))
    expect(ids(run({ sessions: [session(0)], attempts: [attempt('pq-1', 1, 80)] }))).toEqual(['first_session', 'first_drill_passed'])
    const ten = Array.from({ length: 10 }, (_, i) => session(i))
    expect(ids(run({ sessions: ten }))).toContain('sessions_10')
    const mastered = run({ attempts: [attempt('pq-1', 5, 82), attempt('pq-1', 3, 85), attempt('pq-1', 1, 90)] })
    expect(ids(mastered)).toContain('drill_mastered:precision_questioning')
  })
})

describe('loadProgress', () => {
  afterEach(() => vi.restoreAllMocks())
  it('reads only the rep\'s finished simulations and drill attempts', async () => {
    const calls: string[] = []
    const rows: Record<string, unknown> = {
      agent_sessions: [{ record: { session: session(0), phase: 'scored', trace: [], report: null } }],
      drill_attempts: [{ drill_id: 'precision-questioning-1', drill_version: 1, rep_id: 'rep-1', attempt_no: 1, created_at: at(1), observed_behaviors: [], score: 80, passed: true, lang: 'en' }],
    }
    const supabase = { from: (t: string) => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'order', 'limit']) c[m] = (...a: unknown[]) => { calls.push(`${t}:${m}:${a.join(',')}`); return c }; c.then = (r: (v: unknown) => void) => r({ data: rows[t] }); return c } }
    const p = await loadProgress(supabase as never, 'rep-1', NOW)
    expect(calls).toContain('agent_sessions:eq:rep_id,rep-1')
    expect(calls.some(c => c.startsWith('agent_sessions:in:phase,scored,reported'))).toBe(true)
    expect(calls).toContain('drill_attempts:eq:rep_id,rep-1')
    expect(p.totals).toMatchObject({ sessions: 1, practiceDays: 2 })
    expect(p.drills[0].type).toBe('precision_questioning')
  })
})
