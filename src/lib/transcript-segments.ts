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

/** Writes one transcript version's worth of segments. Uses upsert (not
 * insert) keyed on the table's unique constraint
 * (session_type, session_id, transcript_version, segment_index) so that a
 * rep re-picking the speaker — which calls this again for the same
 * sessionId/transcriptVersion via useRoleplayRecorder's existing
 * backToPickSpeaker()/pickSpeaker() flow — overwrites the previous rows'
 * speaker_role labeling instead of colliding with the unique constraint and
 * silently keeping the original (possibly wrong) labeling forever. Behaves
 * identically to a plain insert on the first call, when no rows exist yet
 * to conflict with.
 *
 * Never partially writes: on failure the caller sees the error and the
 * session's report generation simply has no segments to work from (never a
 * truncated set). Wrapped in try/catch because supabase-js is not
 * guaranteed to reject-never — some client configurations/mocks can throw
 * rather than resolve to {error}, and a thrown exception here must not
 * propagate into the caller's outer try/catch (which would set
 * saveError = true and incorrectly imply the whole report failed, when
 * only segment persistence did). */
export async function persistTranscriptSegments(
  supabase: SupabaseClient, args: Parameters<typeof toTranscriptSegmentRows>[0],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = toTranscriptSegmentRows(args)
  if (rows.length === 0) return { ok: true }
  try {
    const { error } = await supabase.from('transcript_segments').upsert(rows, {
      onConflict: 'session_type,session_id,transcript_version,segment_index',
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
