import { createAdminClient } from '@/lib/supabase-admin'
import { weeklySince } from '@/lib/champions-core'
import { rankTeams, type LeagueXpRow } from '@/lib/leagues-core'

export interface LeagueTeam {
  companyId: string
  name: string
  avgXp: number
  repCount: number
  rank: number
  isSelf: boolean
}
export interface LeagueBoard {
  leagueName: string
  teams: LeagueTeam[]
  selfRank: number | null
  selfTeamId: string | null
}

/**
 * Weekly cross-team league board for the caller's company. Null when the team
 * is in no league, or its league has fewer than 2 member companies. Reads with
 * the service-role admin client (same pattern as champions.ts).
 */
export async function getLeagueBoard(userId: string): Promise<LeagueBoard | null> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()
  if (!me?.company_id) return null

  const { data: myCompany } = await admin
    .from('companies')
    .select('league_id')
    .eq('id', me.company_id)
    .single()
  if (!myCompany?.league_id) return null

  const { data: league } = await admin
    .from('leagues')
    .select('name')
    .eq('id', myCompany.league_id)
    .single()

  const { data: members } = await admin
    .from('companies')
    .select('id, name')
    .eq('league_id', myCompany.league_id)
  if (!members || members.length < 2) return null

  const memberIds = members.map(m => m.id)
  const nameByCompany = new Map(members.map(m => [m.id, m.name as string]))

  // role='rep' members of every team -> repByCompany + repCounts.
  const { data: reps } = await admin
    .from('profiles')
    .select('id, company_id')
    .in('company_id', memberIds)
    .eq('role', 'rep')

  const repByCompany = new Map<string, string>()
  const repCounts = new Map<string, number>()
  for (const id of memberIds) repCounts.set(id, 0)
  for (const r of reps ?? []) {
    repByCompany.set(r.id, r.company_id as string)
    repCounts.set(r.company_id as string, (repCounts.get(r.company_id as string) ?? 0) + 1)
  }

  const repIds = [...repByCompany.keys()]
  const since = weeklySince()
  let rows: LeagueXpRow[] = []
  if (repIds.length) {
    const { data } = await admin
      .from('xp_events')
      .select('rep_id, amount, created_at')
      .in('rep_id', repIds)
      .gte('created_at', since.toISOString())
    rows = (data ?? []) as LeagueXpRow[]
  }

  const ranked = rankTeams(rows, repCounts, repByCompany, since)
  const teams: LeagueTeam[] = ranked.map(t => ({
    companyId: t.companyId,
    name: nameByCompany.get(t.companyId) ?? 'Team',
    avgXp: t.avgXp,
    repCount: t.repCount,
    rank: t.rank,
    isSelf: t.companyId === me.company_id,
  }))

  const self = teams.find(t => t.isSelf) ?? null
  return {
    leagueName: league?.name ?? 'League',
    teams,
    selfRank: self?.rank ?? null,
    selfTeamId: me.company_id,
  }
}
