import { createAdminClient } from '@/lib/supabase-admin'

// Every table holding a rep's own practice-derived history — never the raw
// audio (never stored in the first place), just the scores/metadata rows a
// rep might reasonably want to clear.
const HISTORY_TABLES = [
  'roleplay_sessions',
  'voice_partner_sessions',
  'voice_partner_opening_sessions',
  'voice_partner_question_sessions',
  'voice_partner_fab_sessions',
  'voice_partner_closing_sessions',
  'agent_sessions',
  'drill_attempts',
] as const

export interface VoiceHistoryCounts {
  roleplay_sessions: number
  voice_partner_sessions: number
  voice_partner_opening_sessions: number
  voice_partner_question_sessions: number
  voice_partner_fab_sessions: number
  voice_partner_closing_sessions: number
  agent_sessions: number
  drill_attempts: number
  total: number
}

/** How many rows of practice history a rep has, per table — for the privacy panel. */
export async function getVoiceHistoryCounts(userId: string): Promise<VoiceHistoryCounts> {
  const admin = createAdminClient()
  const counts = await Promise.all(
    HISTORY_TABLES.map(table =>
      admin.from(table).select('id', { count: 'exact', head: true }).eq('rep_id', userId)
    )
  )
  const result = {} as VoiceHistoryCounts
  let total = 0
  HISTORY_TABLES.forEach((table, i) => {
    const n = counts[i].count ?? 0
    result[table] = n
    total += n
  })
  result.total = total
  return result
}

/** Practice session types whose saved transcripts and AI reports go with the practice history. Customer
 * visits are excluded: they follow their own retention setting (customer_visits.retention_policy). */
const PRACTICE_REPORT_TYPES = ['human_partner', 'ai_doctor_voice', 'ai_doctor_text'] as const

/** Deletes every practice-history row belonging to this rep, across all history tables, plus the transcripts
 * and AI reports derived from those practice sessions (they hold quoted words, so they must not outlive them). */
export async function deleteVoiceHistory(userId: string): Promise<void> {
  const admin = createAdminClient()
  await Promise.all([
    ...HISTORY_TABLES.map(table => admin.from(table).delete().eq('rep_id', userId)),
    admin.from('transcript_segments').delete().eq('rep_id', userId).eq('session_type', 'human_partner'),
    admin.from('conversation_reports').delete().eq('rep_id', userId).in('session_type', [...PRACTICE_REPORT_TYPES]),
  ])
}
