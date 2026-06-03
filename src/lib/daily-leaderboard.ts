import { createAdminClient } from '@/lib/supabase-admin'
import { computeStreak, dailyPick, todayKey } from '@/lib/daily'

export interface DailyStanding {
  id: string
  name: string
  streak: number
  total: number
  doneToday: boolean
  isSelf: boolean
}

export interface DailyLeaderboard {
  pick: { level: number; scenarioId: number }
  today: string
  self: DailyStanding | null
  standings: DailyStanding[]
}

/**
 * Daily Challenge standings for the caller's team (or just themselves if they
 * have no company yet). Read with the service-role admin client, so no
 * cross-company RLS policy is needed.
 */
export async function getDailyLeaderboard(userId: string): Promise<DailyLeaderboard> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id, display_name')
    .eq('id', userId)
    .single()

  // Peers = everyone in the same company; otherwise just the caller.
  const names = new Map<string, string | null>()
  let repIds: string[] = [userId]
  if (me?.company_id) {
    const { data: peers } = await admin
      .from('profiles')
      .select('id, display_name')
      .eq('company_id', me.company_id)
    if (peers?.length) {
      repIds = peers.map(p => p.id)
      for (const p of peers) names.set(p.id, p.display_name)
    }
  }
  if (!names.size) names.set(userId, me?.display_name ?? null)

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 90)
  const sinceKey = since.toISOString().slice(0, 10)

  const { data: rows } = await admin
    .from('daily_challenges')
    .select('rep_id, challenge_date')
    .in('rep_id', repIds)
    .gte('challenge_date', sinceKey)

  const byRep = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    const set = byRep.get(r.rep_id) ?? new Set<string>()
    set.add(r.challenge_date as string)
    byRep.set(r.rep_id, set)
  }

  const today = todayKey()
  const standings: DailyStanding[] = repIds
    .map(id => {
      const dates = byRep.get(id) ?? new Set<string>()
      return {
        id,
        name: names.get(id) ?? 'Rep',
        streak: computeStreak(dates),
        total: dates.size,
        doneToday: dates.has(today),
        isSelf: id === userId,
      }
    })
    // Show players with history, but always include the caller.
    .filter(s => s.total > 0 || s.isSelf)
    .sort((a, b) => b.streak - a.streak || b.total - a.total)

  const self = standings.find(s => s.isSelf) ?? null
  return { pick: dailyPick(), today, self, standings }
}
