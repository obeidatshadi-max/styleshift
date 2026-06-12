import { getDailyLeaderboard } from '@/lib/daily-leaderboard'
import type { TeamStats } from '@/lib/team-stats'
import type { ManagerAssignmentView } from '@/lib/assignments'

// Team Pulse: everything the manager needs to keep the game socially alive,
// computed live on dashboard load — no cron, no stored state. The manager
// shares the generated text to the team's WhatsApp group.

export interface PulseRep {
  name: string
  streak: number
}

export interface TeamPulse {
  /** Reps with an active streak who haven't finished today's daily set. */
  atRisk: PulseRep[]
  /** Reps whose last visit was 3+ days ago (or never). */
  inactive: { name: string; days: number | null }[]
  /** Last-7-days digest ingredients. */
  weekly: {
    sessions: number
    topRep: string | null
    weakestLevel: string | null
    weakestAvg: number
    assignmentDone: number
    assignmentTotal: number
  }
}

const DAY_MS = 86400000

export async function getTeamPulse(
  managerId: string,
  stats: TeamStats,
  assignment: ManagerAssignmentView | null
): Promise<TeamPulse> {
  const repIds = new Set(stats.reps.map(r => r.id))
  const daily = await getDailyLeaderboard(managerId)

  const atRisk = daily.standings
    .filter(s => repIds.has(s.id) && s.streak > 0 && !s.doneToday)
    .map(s => ({ name: s.name, streak: s.streak }))
    .sort((a, b) => b.streak - a.streak)

  const today = Date.now()
  const inactive = stats.reps
    .map(r => {
      const days = r.last_visit
        ? Math.floor((today - new Date(r.last_visit + 'T00:00:00Z').getTime()) / DAY_MS)
        : null
      return { name: r.display_name ?? 'Rep', days }
    })
    .filter(r => r.days === null || r.days >= 3)
    .sort((a, b) => (b.days ?? 999) - (a.days ?? 999))

  // stats.activity already holds the last 7 days of session counts.
  const sessions = stats.activity.reduce((sum, d) => sum + d.count, 0)
  const topRep = stats.reps[0]?.display_name ?? null // reps come sorted by XP

  const played = stats.levelAccuracy.filter(l => l.avg > 0)
  const weakest = played.length
    ? played.reduce((min, l) => (l.avg < min.avg ? l : min))
    : null

  return {
    atRisk,
    inactive,
    weekly: {
      sessions,
      topRep,
      weakestLevel: weakest?.title ?? null,
      weakestAvg: weakest?.avg ?? 0,
      assignmentDone: assignment ? assignment.reps.filter(r => r.completed_at).length : 0,
      assignmentTotal: assignment ? assignment.reps.length : 0,
    },
  }
}
