import { createAdminClient } from '@/lib/supabase-admin'

export interface RepStat {
  id: string
  display_name: string | null
  xp: number
  last_visit: string | null
  total_sessions: number
  avg_accuracy: number
  flag: boolean
}

export interface TeamStats {
  reps: RepStat[]
  levelAccuracy: { level: number; title: string; avg: number }[]
  activity: { day: string; count: number }[]
  plan: string
  inviteCode: string
}

const LEVEL_TITLES: Record<number, string> = {
  1: 'Style Scan', 2: 'Crisis Mode', 3: 'Drive Decoder', 4: 'The Boardroom'
}

/**
 * Computes team analytics for the company managed by `userId`.
 * Returns null if the user is not a manager of any company.
 * Uses the service-role admin client, so it runs the same whether called
 * from an API route or directly inside a server component.
 */
export async function getTeamStatsForUser(userId: string): Promise<TeamStats | null> {
  const admin = createAdminClient()

  const { data: manager } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single()

  if (!manager?.company_id || manager.role !== 'manager') return null

  const companyId = manager.company_id

  const { data: company } = await admin
    .from('companies')
    .select('plan, invite_code')
    .eq('id', companyId)
    .single()

  const { data: reps } = await admin
    .from('profiles')
    .select('id, display_name, xp, last_visit')
    .eq('company_id', companyId)
    .eq('role', 'rep')
    .order('xp', { ascending: false })

  const emptyLevels = [1, 2, 3, 4].map(l => ({ level: l, title: LEVEL_TITLES[l], avg: 0 }))

  if (!reps?.length) {
    return {
      reps: [],
      levelAccuracy: emptyLevels,
      activity: buildActivity([]),
      plan: company?.plan ?? 'free',
      inviteCode: company?.invite_code ?? '',
    }
  }

  const repIds = reps.map(r => r.id)

  const { data: sessions } = await admin
    .from('sessions')
    .select('rep_id, level, accuracy, completed_at')
    .in('rep_id', repIds)

  const allSessions = sessions ?? []

  const repStats: RepStat[] = reps.map(rep => {
    const repSessions = allSessions.filter(s => s.rep_id === rep.id)
    const avg = repSessions.length
      ? Math.round(repSessions.reduce((sum, s) => sum + s.accuracy, 0) / repSessions.length)
      : 0
    return {
      id: rep.id,
      display_name: rep.display_name,
      xp: rep.xp,
      last_visit: rep.last_visit,
      total_sessions: repSessions.length,
      avg_accuracy: avg,
      flag: avg > 0 && avg < 70,
    }
  })

  const levelAccuracy = [1, 2, 3, 4].map(level => {
    const ls = allSessions.filter(s => s.level === level)
    const avg = ls.length ? Math.round(ls.reduce((sum, s) => sum + s.accuracy, 0) / ls.length) : 0
    return { level, title: LEVEL_TITLES[level], avg }
  })

  return {
    reps: repStats,
    levelAccuracy,
    activity: buildActivity(allSessions),
    plan: company?.plan ?? 'free',
    inviteCode: company?.invite_code ?? '',
  }
}

function buildActivity(sessions: { completed_at: string | null }[]) {
  const today = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    const day = d.toISOString().slice(0, 10)
    const count = sessions.filter(s => s.completed_at?.startsWith(day)).length
    return { day, count }
  })
}
