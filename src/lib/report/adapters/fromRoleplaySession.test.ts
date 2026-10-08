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
    expect(context.savedCounterpartStyle).toBe('analytical')
    expect(context.deterministicMetrics.talkRatio).toBe(0.55)
  })
})
