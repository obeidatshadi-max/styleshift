import { createAdminClient } from '@/lib/supabase-admin'
import type { VoiceMode } from '@/lib/voice-events'

const ERROR_STAGES = new Set([
  'mic_denied', 'not_configured', 'rate_limited', 'api_error', 'bad_response', 'network_error', 'tts_failed',
])

export interface VoiceModeStat {
  mode: VoiceMode
  sessionsCompleted: number
  errorEvents: number
}

export interface RepVoiceStat {
  rep_id: string
  sessionsCompleted: number
  lastPracticed: string | null
}

export interface VoiceLangStat {
  lang: 'en' | 'ar'
  sessionsCompleted: number
  errorEvents: number
}

export interface VoiceStats {
  byMode: VoiceModeStat[]
  byRep: Map<string, RepVoiceStat>
  byLang: VoiceLangStat[]
  totalSessions: number
  totalErrors: number
}

const MODES: VoiceMode[] = ['objection', 'opening', 'question', 'fab', 'closing']

/** Aggregates the voice_events funnel for a set of reps — manager dashboard read. */
export async function getVoiceStats(repIds: string[]): Promise<VoiceStats> {
  const empty: VoiceStats = {
    byMode: MODES.map(mode => ({ mode, sessionsCompleted: 0, errorEvents: 0 })),
    byRep: new Map(),
    byLang: [{ lang: 'en', sessionsCompleted: 0, errorEvents: 0 }, { lang: 'ar', sessionsCompleted: 0, errorEvents: 0 }],
    totalSessions: 0,
    totalErrors: 0,
  }
  if (repIds.length === 0) return empty

  const admin = createAdminClient()
  const { data: events } = await admin
    .from('voice_events')
    .select('rep_id, mode, stage, created_at, meta')
    .in('rep_id', repIds)

  const rows = events ?? []
  const byMode = new Map(MODES.map(mode => [mode, { mode, sessionsCompleted: 0, errorEvents: 0 }]))
  const byRep = new Map<string, RepVoiceStat>()
  const byLang = new Map<'en' | 'ar', VoiceLangStat>([
    ['en', { lang: 'en', sessionsCompleted: 0, errorEvents: 0 }],
    ['ar', { lang: 'ar', sessionsCompleted: 0, errorEvents: 0 }],
  ])

  for (const row of rows) {
    const mode = row.mode as VoiceMode
    const modeStat = byMode.get(mode)
    if (modeStat && row.stage === 'session_complete') modeStat.sessionsCompleted++
    if (modeStat && ERROR_STAGES.has(row.stage)) modeStat.errorEvents++

    // meta.lang was only added once step 9 wired it through — older rows
    // predate it and fall outside the en/ar split rather than skewing 'en'.
    const lang = (row.meta as { lang?: unknown } | null)?.lang
    const langStat = lang === 'en' || lang === 'ar' ? byLang.get(lang) : undefined
    if (langStat && row.stage === 'session_complete') langStat.sessionsCompleted++
    if (langStat && ERROR_STAGES.has(row.stage)) langStat.errorEvents++

    if (row.stage === 'session_complete') {
      const rep = byRep.get(row.rep_id) ?? { rep_id: row.rep_id, sessionsCompleted: 0, lastPracticed: null }
      rep.sessionsCompleted++
      if (!rep.lastPracticed || row.created_at > rep.lastPracticed) rep.lastPracticed = row.created_at
      byRep.set(row.rep_id, rep)
    }
  }

  const modeStats = [...byMode.values()]
  return {
    byMode: modeStats,
    byRep,
    byLang: [...byLang.values()],
    totalSessions: modeStats.reduce((s, m) => s + m.sessionsCompleted, 0),
    totalErrors: rows.filter(r => ERROR_STAGES.has(r.stage)).length,
  }
}
