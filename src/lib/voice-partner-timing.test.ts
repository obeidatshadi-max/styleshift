import { describe, it, expect } from 'vitest'
import { computeRealtimeSignals, hasTimingData } from './voice-partner-timing'
import type { ConversationTurn } from '@/types/game'

function turn(overrides: Partial<ConversationTurn>): ConversationTurn {
  return {
    id: 't1', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0,
    role: 'doctor', text: 'It costs too much.', objection_type: null, clear_steps_hit: [],
    trust: 50, skepticism: 50, engagement: 50, time_pressure: 30,
    started_at: null, ended_at: null, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('hasTimingData', () => {
  it('is false when no turn carries both timestamps', () => {
    expect(hasTimingData([turn({})])).toBe(false)
  })

  it('is true when at least one turn carries both timestamps', () => {
    expect(hasTimingData([
      turn({}),
      turn({ turn_index: 1, role: 'rep', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z' }),
    ])).toBe(true)
  })
})

describe('computeRealtimeSignals', () => {
  it('returns null when no turn has timing data', () => {
    expect(computeRealtimeSignals([turn({})])).toBeNull()
  })

  it('computes talk ratio, rapid turn switches, and avg response latency from real timestamps', () => {
    const turns = [
      turn({
        turn_index: 0, role: 'doctor', text: 'Doctor opens.',
        started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z',
      }),
      turn({
        turn_index: 1, role: 'rep', text: 'Rep replies for four seconds.',
        started_at: '2026-01-01T00:00:03.000Z', ended_at: '2026-01-01T00:00:07.000Z',
      }),
      turn({
        turn_index: 2, role: 'doctor', text: 'Doctor replies for one second.',
        started_at: '2026-01-01T00:00:07.200Z', ended_at: '2026-01-01T00:00:08.200Z',
      }),
    ]
    const signals = computeRealtimeSignals(turns)
    expect(signals).not.toBeNull()
    expect(signals!.talkRatio.repMs).toBe(4000)
    expect(signals!.talkRatio.partnerMs).toBe(3000)
    expect(signals!.interruptionCount).toBe(0)
    // Doctor turn 2 starts 200ms after rep turn 1 ends — a fast back-and-forth,
    // not a true interruption (turn 1 already ended before turn 2 started).
    expect(signals!.avgResponseLatencyMs).toBe(200)
  })

  it('counts a rapid speaker switch as an interruption proxy', () => {
    const turns = [
      turn({
        turn_index: 0, role: 'doctor',
        started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:03.000Z',
      }),
      turn({
        // Rep starts 100ms BEFORE the doctor's turn ends — a genuine overlap/cut-off.
        turn_index: 1, role: 'rep',
        started_at: '2026-01-01T00:00:02.900Z', ended_at: '2026-01-01T00:00:05.000Z',
      }),
    ]
    const signals = computeRealtimeSignals(turns)
    expect(signals!.interruptionCount).toBe(1)
  })

  it('skips turns missing either timestamp rather than treating them as zero-duration', () => {
    const turns = [
      turn({ turn_index: 0, role: 'doctor', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z' }),
      turn({ turn_index: 1, role: 'rep', started_at: null, ended_at: null }), // text-based-path fallback turn mixed in
      turn({ turn_index: 2, role: 'doctor', started_at: '2026-01-01T00:00:05.000Z', ended_at: '2026-01-01T00:00:06.000Z' }),
    ]
    const signals = computeRealtimeSignals(turns)
    expect(signals!.talkRatio.totalMs).toBe(3000) // only the two doctor turns with real timing
  })
})
