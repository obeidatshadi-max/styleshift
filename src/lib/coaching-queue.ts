import { createAdminClient } from '@/lib/supabase-admin'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { getVoiceStats } from '@/lib/voice-stats'
import { getAssignmentForManager } from '@/lib/assignments'

export type CoachingFlag = 'low_accuracy' | 'inactive' | 'assignment_overdue' | 'no_voice_practice'

export interface CoachingQueueInput {
  rep_id: string
  name: string | null
  avgAccuracy: number
  lastVisit: string | null
  isLowAccuracy: boolean
  isAssignmentOverdue: boolean
  hasVoicePractice: boolean
  levelAccuracies: { level: number; avg: number }[]
}

export interface CoachingQueueEntry {
  rep_id: string
  name: string | null
  avgAccuracy: number
  flags: CoachingFlag[]
  suggestedLevel: number
}

const INACTIVE_DAYS_THRESHOLD = 3
const DAY_MS = 86400000
const MAX_ENTRIES = 6

/**
 * Pure: turns per-rep signals into a ranked coaching queue — most concern
 * flags first, worst accuracy breaks ties. A rep with zero flags has
 * nothing to coach and is dropped, not ranked last.
 */
export function buildCoachingQueue(inputs: CoachingQueueInput[], nowMs: number): CoachingQueueEntry[] {
  const entries: CoachingQueueEntry[] = []

  for (const input of inputs) {
    const flags: CoachingFlag[] = []
    if (input.isLowAccuracy) flags.push('low_accuracy')

    const days = input.lastVisit
      ? Math.floor((nowMs - new Date(input.lastVisit + 'T00:00:00Z').getTime()) / DAY_MS)
      : null
    if (days === null || days >= INACTIVE_DAYS_THRESHOLD) flags.push('inactive')

    if (input.isAssignmentOverdue) flags.push('assignment_overdue')
    if (!input.hasVoicePractice) flags.push('no_voice_practice')

    if (flags.length === 0) continue

    const suggestedLevel = input.levelAccuracies.length
      ? input.levelAccuracies.reduce((worst, cur) => (cur.avg < worst.avg ? cur : worst)).level
      : 1

    entries.push({ rep_id: input.rep_id, name: input.name, avgAccuracy: input.avgAccuracy, flags, suggestedLevel })
  }

  entries.sort((a, b) => b.flags.length - a.flags.length || a.avgAccuracy - b.avgAccuracy)
  return entries.slice(0, MAX_ENTRIES)
}

/** Assembles per-rep signals from the manager's existing stats/voice/assignment views and ranks them. */
export async function getCoachingQueue(managerId: string): Promise<CoachingQueueEntry[]> {
  const stats = await getTeamStatsForUser(managerId)
  if (!stats || stats.reps.length === 0) return []

  const repIds = stats.reps.map(r => r.id)
  const [voiceStats, assignmentView] = await Promise.all([
    getVoiceStats(repIds),
    getAssignmentForManager(managerId),
  ])

  const overdueRepIds = new Set(
    assignmentView && assignmentView.assignment.due_date < new Date().toISOString().slice(0, 10)
      ? assignmentView.reps.filter(r => !r.completed_at).map(r => r.rep_id)
      : []
  )

  const admin = createAdminClient()
  const { data: levelRows } = await admin.from('sessions').select('rep_id, level, accuracy').in('rep_id', repIds)

  const inputs: CoachingQueueInput[] = stats.reps.map(rep => {
    const repRows = (levelRows ?? []).filter(r => r.rep_id === rep.id)
    const byLevel = new Map<number, { sum: number; n: number }>()
    for (const row of repRows) {
      const cur = byLevel.get(row.level) ?? { sum: 0, n: 0 }
      cur.sum += row.accuracy
      cur.n += 1
      byLevel.set(row.level, cur)
    }
    const levelAccuracies = [...byLevel.entries()].map(([level, { sum, n }]) => ({ level, avg: sum / n }))

    return {
      rep_id: rep.id,
      name: rep.display_name,
      avgAccuracy: rep.avg_accuracy,
      lastVisit: rep.last_visit,
      isLowAccuracy: rep.flag,
      isAssignmentOverdue: overdueRepIds.has(rep.id),
      hasVoicePractice: (voiceStats.byRep.get(rep.id)?.sessionsCompleted ?? 0) > 0,
      levelAccuracies,
    }
  })

  return buildCoachingQueue(inputs, Date.now())
}
