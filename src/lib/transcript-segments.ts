import type { SupabaseClient } from '@supabase/supabase-js'

export interface RawUtterance { speaker: string; text: string; start: number; end: number }

export interface TranscriptSegmentRow {
  session_type: 'human_partner' | 'customer_visit'
  session_id: string
  rep_id: string
  transcript_version: number
  segment_index: number
  speaker_role: 'rep' | 'counterpart'
  text: string
  start_ms: number | null
  end_ms: number | null
}

export function toTranscriptSegmentRows(args: {
  utterances: RawUtterance[]
  repSpeaker: string
  sessionType: 'human_partner' | 'customer_visit'
  sessionId: string
  repId: string
  transcriptVersion: number
}): TranscriptSegmentRow[] {
  return args.utterances.map((u, segment_index) => ({
    session_type: args.sessionType,
    session_id: args.sessionId,
    rep_id: args.repId,
    transcript_version: args.transcriptVersion,
    segment_index,
    speaker_role: u.speaker === args.repSpeaker ? 'rep' : 'counterpart',
    text: u.text,
    start_ms: u.start,
    end_ms: u.end,
  }))
}

/** Writes one transcript version's worth of segments. Never partially
 * writes: on failure the caller sees the error and the session's report
 * generation simply has no segments to work from (never a truncated set). */
export async function persistTranscriptSegments(
  supabase: SupabaseClient, args: Parameters<typeof toTranscriptSegmentRows>[0],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = toTranscriptSegmentRows(args)
  if (rows.length === 0) return { ok: true }
  const { error } = await supabase.from('transcript_segments').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
