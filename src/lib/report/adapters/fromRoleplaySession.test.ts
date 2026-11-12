import { describe, it, expect } from 'vitest'
import { adaptRoleplaySession, type RoleplaySessionRow, type TranscriptSegmentRow } from './fromRoleplaySession'

const segmentRows: TranscriptSegmentRow[] = [
  { segment_index: 0, speaker_role: 'rep', text: 'Good morning, thanks for the time.', start_ms: 0, end_ms: 2000 },
  { segment_index: 1, speaker_role: 'counterpart', text: 'I only have ten minutes.', start_ms: 2000, end_ms: 4000 },
]
const sessionRow: RoleplaySessionRow = {
  talk_ratio: 0.55, rapid_turn_switches: 2, question_ratio: 0.3, open_question_ratio: 0.6,
  paraphrase_score: 0.4, active_listening_score: 70, rep_style: 'driver', partner_style: 'analytical', adaptation_score: 60,
}

describe('adaptRoleplaySession', () => {
  it('carries real audio offsets through unchanged', () => {
    const { segments } = adaptRoleplaySession(segmentRows, sessionRow)
    expect(segments[0].startMs).toBe(0)
    expect(segments[1].endMs).toBe(4000)
  })
  it('passes stored deterministic metrics through as context, not simulation', () => {
    const { context } = adaptRoleplaySession(segmentRows, sessionRow)
    expect(context.isSimulation).toBe(false)
    expect(context.deterministicMetrics.talkRatio).toBe(0.55)
  })
  it('does not treat the session\'s own automatic style read as a saved profile', () => {
    const { context } = adaptRoleplaySession(segmentRows, sessionRow)
    expect(context.savedCounterpartStyle).toBeNull()
    expect(context.configuredPracticeStyle).toBeNull()
  })
  it('keeps the acoustic style read and its adaptation score out of the model context', () => {
    const { context } = adaptRoleplaySession(segmentRows, sessionRow)
    expect(context.deterministicMetrics).not.toHaveProperty('repStyle')
    expect(context.deterministicMetrics).not.toHaveProperty('adaptationScore')
    expect(JSON.stringify(context)).not.toContain('driver')
  })
  it('carries the saved doctor\'s style as a practice setting, and ignores anything that is not a style', () => {
    expect(adaptRoleplaySession(segmentRows, sessionRow, 'amiable').context.configuredPracticeStyle).toBe('amiable')
    expect(adaptRoleplaySession(segmentRows, sessionRow, 'amiable').context.savedCounterpartStyle).toBeNull()
    expect(adaptRoleplaySession(segmentRows, sessionRow, 'nonsense' as never).context.configuredPracticeStyle).toBeNull()
  })
})
