import { describe, it, expect } from 'vitest'
import { findPressureMoment, computePressureShift } from './pressure-shift'
import type { ConversationTurn } from '@/types/game'

function turn(overrides: Partial<ConversationTurn>): ConversationTurn {
  return {
    id: 't1', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0,
    role: 'doctor', text: 'It costs too much.', objection_type: null, clear_steps_hit: [],
    trust: 50, skepticism: 50, engagement: 50, time_pressure: 30, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('findPressureMoment', () => {
  it('returns null when no doctor-turn snapshot moves enough', () => {
    const turns = [
      turn({ turn_index: 0, role: 'doctor', trust: 50, skepticism: 50, engagement: 50, time_pressure: 30 }),
      turn({ turn_index: 1, role: 'rep', text: 'What worries you most?' }),
      turn({ turn_index: 2, role: 'doctor', trust: 52, skepticism: 48, engagement: 51, time_pressure: 30 }),
    ]
    expect(findPressureMoment(turns)).toBeNull()
  })

  it('detects a doctor turn whose state swings against the rep beyond the threshold', () => {
    const turns = [
      turn({ turn_index: 0, role: 'doctor', trust: 60, skepticism: 40, engagement: 60, time_pressure: 20 }),
      turn({ turn_index: 1, role: 'rep', text: 'Tell me about your concern.' }),
      turn({ turn_index: 2, role: 'doctor', trust: 45, skepticism: 52, engagement: 55, time_pressure: 20 }),
    ]
    const moment = findPressureMoment(turns)
    expect(moment).not.toBeNull()
    expect(moment!.turnIndex).toBe(2)
    expect(moment!.trustDelta).toBe(-15)
    expect(moment!.skepticismDelta).toBe(12)
    expect(moment!.pressureIndex).toBe(12 + 0 - (-15) - (-5)) // skepticism + timePressure - trust - engagement
  })

  it('ignores doctor turns with an incomplete state snapshot', () => {
    const turns = [
      turn({ turn_index: 0, role: 'doctor', trust: null }),
      turn({ turn_index: 2, role: 'doctor', trust: 10, skepticism: 90, engagement: 10, time_pressure: 90 }),
    ]
    expect(findPressureMoment(turns)).toBeNull()
  })

  it('returns null with fewer than two doctor turns carrying a full snapshot', () => {
    const turns = [turn({ turn_index: 0, role: 'doctor' })]
    expect(findPressureMoment(turns)).toBeNull()
  })
})

describe('computePressureShift', () => {
  const pressuredSession: ConversationTurn[] = [
    turn({ turn_index: 0, role: 'doctor', text: 'Your product is too expensive.', trust: 60, skepticism: 35, engagement: 60, time_pressure: 20 }),
    turn({ turn_index: 1, role: 'rep', text: 'What specifically worries you about the cost?', clear_steps_hit: ['clarify'] }),
    turn({ turn_index: 2, role: 'doctor', text: 'Frankly I do not think this data holds up at all.', trust: 40, skepticism: 55, engagement: 55, time_pressure: 25 }),
    turn({ turn_index: 3, role: 'rep', text: 'Sure.' }),
    turn({ turn_index: 4, role: 'doctor', text: 'I am also very short on time today.', trust: 38, skepticism: 56, engagement: 53, time_pressure: 26 }),
    turn({ turn_index: 5, role: 'rep', text: 'I hear that time is tight, so let me be direct about what changes for your patients and why the adherence data still applies here.', clear_steps_hit: ['listen', 'answer'] }),
  ]

  it('returns null when no pressure moment is found', () => {
    const calm: ConversationTurn[] = [
      turn({ turn_index: 0, role: 'doctor' }),
      turn({ turn_index: 1, role: 'rep', text: 'Ok.' }),
      turn({ turn_index: 2, role: 'doctor', trust: 51, skepticism: 49 }),
    ]
    expect(computePressureShift(calm)).toBeNull()
  })

  it('compares before/after rep-turn behavior around the detected pressure moment', () => {
    const result = computePressureShift(pressuredSession)
    expect(result).not.toBeNull()
    expect(result!.moment.turnIndex).toBe(2)
    // before = the single rep turn (index 1) strictly before turn_index 2
    expect(result!.before.turnCount).toBe(1)
    // after = every rep turn from turn_index 2 onward (indices 3 and 5)
    expect(result!.after.turnCount).toBe(2)
    expect(result!.after.avgWordsPerTurn).toBeGreaterThan(result!.before.avgWordsPerTurn)
  })

  it('returns null when the pressure moment leaves no rep turn to observe afterward', () => {
    const escalatesImmediately: ConversationTurn[] = [
      turn({ turn_index: 0, role: 'doctor', trust: 60, skepticism: 35 }),
      turn({ turn_index: 1, role: 'rep', text: 'Ok.' }),
      turn({ turn_index: 2, role: 'doctor', trust: 40, skepticism: 55 }),
    ]
    expect(computePressureShift(escalatesImmediately)).toBeNull()
  })
})
