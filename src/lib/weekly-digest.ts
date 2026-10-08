import { createAdminClient } from '@/lib/supabase-admin'

// A manager's "this week" summary: how much the team practised, who has been quiet, and what the
// team's coaching signals have in common. Only data managers can already see (practice sessions,
// voice practice dates, behavioral trends) — never text simulations or debriefs, which stay private.

export interface DigestRep { id: string; display_name: string | null }
export interface DigestSession { rep_id: string; completed_at: string | null }

export interface WeeklyDigest {
  practiceThisWeek: number
  practiceLastWeek: number
  activeReps: number
  totalReps: number
  quietReps: string[]
  topFocus: { label: string; count: number } | null
  summary: string
}

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const MIN_REPS_FOR_FOCUS = 2

export function buildWeeklyDigest(input: {
  companyName: string
  reps: DigestRep[]
  sessions: DigestSession[]
  /** rep id -> ISO date of their last voice practice, if any. */
  voiceLastPracticed: Record<string, string | null>
  /** One coaching-experiment label per rep that has one. */
  focusLabels: string[]
  nowMs: number
}): WeeklyDigest {
  const { reps, sessions, voiceLastPracticed, focusLabels, nowMs } = input
  const inWindow = (iso: string | null | undefined, fromMs: number, toMs: number) => {
    const t = iso ? Date.parse(iso) : NaN
    return Number.isFinite(t) && t > fromMs && t <= toMs
  }
  const thisWeekStart = nowMs - WEEK_MS
  const lastWeekStart = nowMs - 2 * WEEK_MS
  const practiceThisWeek = sessions.filter(s => inWindow(s.completed_at, thisWeekStart, nowMs)).length
  const practiceLastWeek = sessions.filter(s => inWindow(s.completed_at, lastWeekStart, thisWeekStart)).length

  const active = new Set<string>()
  for (const s of sessions) if (inWindow(s.completed_at, thisWeekStart, nowMs)) active.add(s.rep_id)
  for (const [repId, last] of Object.entries(voiceLastPracticed)) if (inWindow(last, thisWeekStart, nowMs)) active.add(repId)
  const quietReps = reps.filter(r => !active.has(r.id)).map(r => r.display_name?.trim() || 'Unnamed rep')

  const counts = new Map<string, number>()
  for (const label of focusLabels) counts.set(label, (counts.get(label) ?? 0) + 1)
  const [label, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? []
  const topFocus = label && count >= MIN_REPS_FOR_FOCUS ? { label, count } : null

  const delta = practiceThisWeek - practiceLastWeek
  const lines = [
    `StyleShift weekly summary - ${input.companyName}`,
    `Game practice: ${practiceThisWeek} sessions this week (${delta === 0 ? 'same as' : `${delta > 0 ? '+' : ''}${delta} vs`} last week)`,
    `Active reps (game or voice): ${active.size} of ${reps.length}`,
    ...(quietReps.length ? [`Not practised this week: ${quietReps.join(', ')}`] : []),
    ...(topFocus ? [`Most common coaching focus: ${topFocus.label} (${topFocus.count} reps)`] : []),
  ]
  return { practiceThisWeek, practiceLastWeek, activeReps: active.size, totalReps: reps.length, quietReps, topFocus, summary: lines.join('\n') }
}

/** Game practice sessions for the last two weeks, for a set of reps. */
export async function getRecentSessions(repIds: string[], nowMs = Date.now()): Promise<DigestSession[]> {
  if (repIds.length === 0) return []
  const { data } = await createAdminClient().from('sessions')
    .select('rep_id, completed_at').in('rep_id', repIds).gte('completed_at', new Date(nowMs - 2 * WEEK_MS).toISOString())
  return (data as DigestSession[] | null) ?? []
}
