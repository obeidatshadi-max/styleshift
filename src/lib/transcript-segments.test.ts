import { describe, it, expect, vi } from 'vitest'
import { toTranscriptSegmentRows, persistTranscriptSegments } from './transcript-segments'
import type { SupabaseClient } from '@supabase/supabase-js'

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

describe('persistTranscriptSegments', () => {
  const baseArgs = {
    utterances: [{ speaker: 'A', text: 'Hello doctor', start: 0, end: 1000 }],
    repSpeaker: 'A',
    sessionType: 'human_partner' as const,
    sessionId: 'sess-1',
    repId: 'rep-1',
    transcriptVersion: 1,
  }

  it('upserts (not inserts) keyed on the table unique constraint, so a re-pick overwrites prior rows instead of colliding', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn()
    const from = vi.fn().mockReturnValue({ upsert, insert })
    const supabase = { from } as unknown as SupabaseClient

    const result = await persistTranscriptSegments(supabase, baseArgs)

    expect(result).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('transcript_segments')
    expect(insert).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    const [rowsArg, optsArg] = upsert.mock.calls[0]
    expect(rowsArg).toEqual(toTranscriptSegmentRows(baseArgs))
    expect(optsArg).toEqual({ onConflict: 'session_type,session_id,transcript_version,segment_index' })
  })

  it('returns ok:false with the message when the upsert call resolves with an error', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'unique_violation' } })
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) } as unknown as SupabaseClient

    const result = await persistTranscriptSegments(supabase, baseArgs)

    expect(result).toEqual({ ok: false, error: 'unique_violation' })
  })

  it('returns ok:false instead of throwing when the supabase call itself throws', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('network down'))
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) } as unknown as SupabaseClient

    const result = await persistTranscriptSegments(supabase, baseArgs)

    expect(result).toEqual({ ok: false, error: 'network down' })
  })

  it('short-circuits to ok:true without calling supabase when there are no utterances', async () => {
    const from = vi.fn()
    const supabase = { from } as unknown as SupabaseClient

    const result = await persistTranscriptSegments(supabase, { ...baseArgs, utterances: [] })

    expect(result).toEqual({ ok: true })
    expect(from).not.toHaveBeenCalled()
  })
})
