import { describe, expect, it } from 'vitest'
import type { RoleplaySessionSummary } from '@/types/game'
import { buildRoleplayBriefing, meetsGoal, displayValue } from './roleplay-briefing'

function session(over: Partial<RoleplaySessionSummary> = {}): RoleplaySessionSummary {
  return {
    id: 's', created_at: '2026-10-01T10:00:00Z', duration_sec: 240,
    talk_ratio: 0.5, question_ratio: 0.3, open_question_ratio: 0.5, paraphrase_score: 0.3,
    active_listening_score: 70, rep_style: null, rep_confidence: null, adaptation_score: 60,
    ...over,
  }
}

describe('buildRoleplayBriefing', () => {
  it('returns null with no sessions', () => {
    expect(buildRoleplayBriefing([])).toBeNull()
  })

  it('has no focus when the last session meets every goal', () => {
    const b = buildRoleplayBriefing([session()])!
    expect(b.focus).toBeNull()
    expect(b.strength).not.toBeNull()
  })

  it('uses only the most recent session and the insight priority order', () => {
    const b = buildRoleplayBriefing([
      session({ talk_ratio: 0.8, question_ratio: 0.1 }),
      session({ talk_ratio: 0.4 }),
    ])!
    expect(b.count).toBe(2)
    expect(b.focus).toEqual({ metric: 'talkRatio', value: 80 })
  })

  it('skips metrics a session did not record', () => {
    const b = buildRoleplayBriefing([session({ adaptation_score: null, open_question_ratio: null, paraphrase_score: null, active_listening_score: null })])!
    expect(b.focus).toBeNull()
  })
})

describe('meetsGoal / displayValue', () => {
  it('treats talk time as lower-is-better', () => {
    expect(meetsGoal('talkRatio', 60)).toBe(true)
    expect(meetsGoal('talkRatio', 70)).toBe(false)
  })
  it('scales ratios to percent and leaves scores alone', () => {
    expect(displayValue(session({ talk_ratio: 0.624 }), 'talkRatio')).toBe(62)
    expect(displayValue(session({ active_listening_score: 55 }), 'activeListening')).toBe(55)
  })
})
