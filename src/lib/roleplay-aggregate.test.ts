import { describe, it, expect } from 'vitest'
import { summarizeRoleplayHistory } from './roleplay-aggregate'
import type { RoleplaySessionSummary } from '@/types/game'

function session(overrides: Partial<RoleplaySessionSummary> & { created_at: string }): RoleplaySessionSummary {
  return {
    id: overrides.created_at,
    duration_sec: 300,
    talk_ratio: 0.5,
    question_ratio: 0.3,
    open_question_ratio: null,
    paraphrase_score: null,
    active_listening_score: null,
    rep_style: null,
    rep_confidence: null,
    ...overrides,
  }
}

describe('summarizeRoleplayHistory', () => {
  it('returns null for no sessions', () => {
    expect(summarizeRoleplayHistory([])).toBeNull()
  })

  it('averages available metrics, ignoring nulls, on a single session', () => {
    const out = summarizeRoleplayHistory([
      session({ created_at: '2026-01-03', talk_ratio: 0.6, question_ratio: 0.2, active_listening_score: 70 }),
    ])
    expect(out!.count).toBe(1)
    expect(out!.averages.talkRatio).toBeCloseTo(60)
    expect(out!.averages.questionRatio).toBeCloseTo(20)
    expect(out!.averages.activeListening).toBeCloseTo(70)
    expect(out!.averages.openQuestionRatio).toBeUndefined()
    expect(out!.trend).toBeNull() // not enough sessions for a trend
  })

  it('detects an improving trend on a higher-is-better metric (question ratio)', () => {
    // newest-first: recent sessions ask more questions than older ones
    const sessions = [
      session({ created_at: '2026-01-04', question_ratio: 0.5 }),
      session({ created_at: '2026-01-03', question_ratio: 0.5 }),
      session({ created_at: '2026-01-02', question_ratio: 0.2 }),
      session({ created_at: '2026-01-01', question_ratio: 0.2 }),
    ]
    const out = summarizeRoleplayHistory(sessions)!
    expect(out.trend).toEqual({ metric: 'questionRatio', direction: 'improving', delta: 30 })
  })

  it('detects an improving trend on the lower-is-better metric (talk ratio going down)', () => {
    const sessions = [
      session({ created_at: '2026-01-04', talk_ratio: 0.4 }),
      session({ created_at: '2026-01-03', talk_ratio: 0.4 }),
      session({ created_at: '2026-01-02', talk_ratio: 0.7 }),
      session({ created_at: '2026-01-01', talk_ratio: 0.7 }),
    ]
    const out = summarizeRoleplayHistory(sessions)!
    expect(out.trend).toEqual({ metric: 'talkRatio', direction: 'improving', delta: 30 })
  })

  it('reports a declining trend when a higher-is-better metric drops', () => {
    const sessions = [
      session({ created_at: '2026-01-04', paraphrase_score: 0.1 }),
      session({ created_at: '2026-01-03', paraphrase_score: 0.1 }),
      session({ created_at: '2026-01-02', paraphrase_score: 0.6 }),
      session({ created_at: '2026-01-01', paraphrase_score: 0.6 }),
    ]
    const out = summarizeRoleplayHistory(sessions)!
    expect(out.trend).toEqual({ metric: 'paraphraseScore', direction: 'declining', delta: 50 })
  })

  it('ignores movement below the noise threshold', () => {
    const sessions = [
      session({ created_at: '2026-01-02', talk_ratio: 0.51 }),
      session({ created_at: '2026-01-01', talk_ratio: 0.50 }),
    ]
    const out = summarizeRoleplayHistory(sessions)!
    expect(out.trend).toBeNull()
  })

  it('picks the largest-delta metric as the headline trend', () => {
    const sessions = [
      session({ created_at: '2026-01-04', question_ratio: 0.4, talk_ratio: 0.5 }),
      session({ created_at: '2026-01-03', question_ratio: 0.4, talk_ratio: 0.5 }),
      session({ created_at: '2026-01-02', question_ratio: 0.3, talk_ratio: 0.55 }),
      session({ created_at: '2026-01-01', question_ratio: 0.3, talk_ratio: 0.55 }),
    ]
    const out = summarizeRoleplayHistory(sessions)!
    expect(out.trend!.metric).toBe('questionRatio') // 10pt move vs talkRatio's 5pt
  })
})
