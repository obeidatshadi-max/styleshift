import { createAdminClient } from '@/lib/supabase-admin'

export interface Standing {
  id: string
  name: string
  xp: number
  isSelf: boolean
}

export interface Standings {
  standings: Standing[] // ranked by XP, highest first
  selfRank: number | null // caller's 1-based position, or null if no team
  teamSize: number
}

/**
 * Overall team ranking by XP for the caller's company. Read with the
 * service-role admin client (same approach as the Daily leaderboard) so no
 * cross-rep RLS policy is needed, and only safe fields (name + XP) are
 * returned — never coaching flags or accuracy. Recomputed on every call, so
 * the rep always sees the current standings when they open it.
 */
export async function getStandings(userId: string): Promise<Standings> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id, display_name, xp')
    .eq('id', userId)
    .single()

  // No company yet → the rep is their own (only) standing.
  if (!me?.company_id) {
    return {
      standings: [{ id: userId, name: me?.display_name ?? 'You', xp: me?.xp ?? 0, isSelf: true }],
      selfRank: 1,
      teamSize: 1,
    }
  }

  const { data: peers } = await admin
    .from('profiles')
    .select('id, display_name, xp')
    .eq('company_id', me.company_id)
    .order('xp', { ascending: false })

  const standings: Standing[] = (peers ?? []).map(p => ({
    id: p.id,
    name: p.display_name ?? 'Rep',
    xp: p.xp ?? 0,
    isSelf: p.id === userId,
  }))

  const idx = standings.findIndex(s => s.isSelf)
  return {
    standings,
    selfRank: idx >= 0 ? idx + 1 : null,
    teamSize: standings.length,
  }
}
