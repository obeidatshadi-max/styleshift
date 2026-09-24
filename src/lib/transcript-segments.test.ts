import { describe, it, expect, vi } from 'vitest'
import { toTranscriptSegmentRows } from './transcript-segments'

describe('toTranscriptSegmentRows', () => {
  it('maps utterances to rows, marking the rep speaker vs everyone else', () => {
    const rows = toTranscriptSegmentRows({
      utterances: [
        { speaker: 'A', text: 'Hello doctor', start: 0, end: 1000 },
        { speaker: 'B', text: 'Hello, busy today', start: 1000, end: 2500 },
      ],
      repSpeaker: 'A',
      sessionType: 'human_partner',
      sessionId: 'sess-1',
      repId: 'rep-1',
      transcriptVersion: 1,
    })
    expect(rows).toEqual([
      { session_type: 'human_partner', session_id: 'sess-1', rep_id: 'rep-1', transcript_version: 1, segment_index: 0, speaker_role: 'rep', text: 'Hello doctor', start_ms: 0, end_ms: 1000 },
      { session_type: 'human_partner', session_id: 'sess-1', rep_id: 'rep-1', transcript_version: 1, segment_index: 1, speaker_role: 'counterpart', text: 'Hello, busy today', start_ms: 1000, end_ms: 2500 },
    ])
  })
})
