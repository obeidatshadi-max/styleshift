import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CRITERIA, buildEvidence, evaluate, isVerifyCode, makeVerifyCode, parseCriteria, type Criteria, type Evidence,
} from './certification'

const now = new Date('2026-11-05T12:00:00Z')
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  gameSessions: 12, avgAccuracy: 80, voiceSessions: 6, winRate: 70, adaptationAvg: 65, adaptationSessions: 4, windowDays: 90, measuredAt: now.toISOString(), ...over,
})

describe('parseCriteria', () => {
  it('accepts the defaults', () => {
    expect(parseCriteria(DEFAULT_CRITERIA)).toEqual({ ok: true, criteria: DEFAULT_CRITERIA })
  })
  it('rejects missing, non-numeric, negative, fractional-count and out-of-range values', () => {
    expect(parseCriteria(null).ok).toBe(false)
    expect(parseCriteria([]).ok).toBe(false)
    expect(parseCriteria({ ...DEFAULT_CRITERIA, minAccuracy: '70' }).ok).toBe(false)
    expect(parseCriteria({ ...DEFAULT_CRITERIA, minAccuracy: -1 }).ok).toBe(false)
    expect(parseCriteria({ ...DEFAULT_CRITERIA, minAccuracy: 101 }).ok).toBe(false)
    expect(parseCriteria({ ...DEFAULT_CRITERIA, minGameSessions: 2.5 }).ok).toBe(false)
    expect(parseCriteria({ ...DEFAULT_CRITERIA, minWinRate: Number.NaN }).ok).toBe(false)
    const { minWinRate: _omit, ...partial } = DEFAULT_CRITERIA
    expect(parseCriteria(partial).ok).toBe(false)
  })
  it('refuses a certificate with no requirement at all', () => {
    expect(parseCriteria({ minGameSessions: 0, minAccuracy: 0, minVoiceSessions: 0, minWinRate: 0, minAdaptation: 0 }).ok).toBe(false)
  })
})

describe('evaluate', () => {
  it('passes when every switched-on requirement is met, and skips switched-off ones', () => {
    const r = evaluate(evidence(), DEFAULT_CRITERIA)
    expect(r.met).toBe(true)
    expect(r.checks.map(c => c.key)).toEqual(['minGameSessions', 'minAccuracy', 'minVoiceSessions', 'minWinRate'])
  })
  it('fails when one requirement is short, and says which', () => {
    const r = evaluate(evidence({ avgAccuracy: 69 }), DEFAULT_CRITERIA)
    expect(r.met).toBe(false)
    expect(r.checks.filter(c => !c.passed).map(c => c.key)).toEqual(['minAccuracy'])
  })
  it('treats the exact threshold as met', () => {
    expect(evaluate(evidence({ gameSessions: 10, avgAccuracy: 70, voiceSessions: 5, winRate: 60 }), DEFAULT_CRITERIA).met).toBe(true)
  })
  it('treats missing evidence as not met, never as zero-passes', () => {
    const none = evidence({ voiceSessions: 0, winRate: null, adaptationAvg: null, adaptationSessions: 0 })
    expect(evaluate(none, DEFAULT_CRITERIA).met).toBe(false)
    const adapt: Criteria = { ...DEFAULT_CRITERIA, minAdaptation: 50 }
    const r = evaluate(evidence({ adaptationAvg: null }), adapt)
    expect(r.checks.find(c => c.key === 'minAdaptation')).toMatchObject({ actual: null, passed: false })
  })
  it('does not pass accuracy for a rep who never played', () => {
    const onlyAccuracy: Criteria = { minGameSessions: 0, minAccuracy: 1, minVoiceSessions: 0, minWinRate: 0, minAdaptation: 0 }
    const r = evaluate(evidence({ gameSessions: 0, avgAccuracy: 0 }), onlyAccuracy)
    expect(r.met).toBe(false)
    expect(r.checks[0]).toMatchObject({ actual: null, passed: false })
  })
})

describe('buildEvidence', () => {
  it('counts only finished voice sessions inside the 90-day window', () => {
    const e = buildEvidence({ id: 'r', total_sessions: 3, avg_accuracy: 75 }, [
      { rep_id: 'r', outcome: 'won', created_at: day(1) },
      { rep_id: 'r', outcome: 'escalated', created_at: day(30) },
      { rep_id: 'r', outcome: 'won', created_at: day(89) },
      { rep_id: 'r', outcome: 'won', created_at: day(91) },
      { rep_id: 'r', outcome: 'abandoned', created_at: day(2) },
    ], [], now)
    expect(e.voiceSessions).toBe(3)
    expect(e.winRate).toBe(67)
    expect(e.gameSessions).toBe(3)
    expect(e.avgAccuracy).toBe(75)
  })
  it('averages only scorecards that carry an adaptation score', () => {
    const e = buildEvidence(undefined, [], [
      { rep_id: 'r', adaptation_score: 60 }, { rep_id: 'r', adaptation_score: 70 }, { rep_id: 'r', adaptation_score: null },
    ], now)
    expect(e.adaptationAvg).toBe(65)
    expect(e.adaptationSessions).toBe(2)
    expect(e.gameSessions).toBe(0)
  })
  it('leaves rates empty rather than zero when there is nothing to measure', () => {
    const e = buildEvidence(undefined, [], [], now)
    expect(e.winRate).toBeNull()
    expect(e.adaptationAvg).toBeNull()
    expect(e.measuredAt).toBe(now.toISOString())
  })
})

describe('verify codes', () => {
  it('makes a 12-character code from the unambiguous alphabet', () => {
    const code = makeVerifyCode(n => Uint8Array.from({ length: n }, (_, i) => i * 7))
    expect(code).toHaveLength(12)
    expect(isVerifyCode(code)).toBe(true)
  })
  it('rejects lookalike, short and non-string codes', () => {
    expect(isVerifyCode('ABCDEFGHJKMN')).toBe(true)
    expect(isVerifyCode('ABCDEFGHJKM0')).toBe(false)
    expect(isVerifyCode('abcdefghjkmn')).toBe(false)
    expect(isVerifyCode('ABC')).toBe(false)
    expect(isVerifyCode(undefined)).toBe(false)
  })
})
