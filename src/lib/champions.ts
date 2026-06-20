import { createAdminClient } from '@/lib/supabase-admin'
import { dailySince, weeklySince, pickChampion, type XpRow } from '@/lib/champions-core'

export interface Champion {
  id: string
  name: string
  avatarUrl: string | null
  periodXp: number
}
export interface Champions {
  daily: Champion | null
  weekly: Champion | null
}

/**
 * Daily + weekly XP champions for the caller's company. Reads the xp_events
 * ledger with the service-role admin client (same pattern as
 * daily-leaderboard.ts) so no cross-company RLS policy is exercised here.
 */
export async function getChampions(userId: string): Promise<Champions> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()

  // Peers = same company; otherwise just the caller (solo rep -> no banner).
  let peers: { id: string; display_name: string | null; avatar_url: string | null }[] = []
  if (me?.company_id) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('company_id', me.company_id)
    peers = data ?? []
  }
  if (!peers.length) return { daily: null, weekly: null }

  const repIds = peers.map(p => p.id)
  const meta = new Map(peers.map(p => [p.id, p]))

  // One ledger read covering the widest window (weekly), then slice per period.
  const weekSince = weeklySince()
  const daySince = dailySince()
  const { data: rows } = await admin
    .from('xp_events')
    .select('rep_id, amount, created_at')
    .in('rep_id', repIds)
    .gte('created_at', weekSince.toISOString())

  const xpRows: XpRow[] = (rows ?? []) as XpRow[]

  const hydrate = (picked: { id: string; periodXp: number } | null): Champion | null => {
    if (!picked) return null
    const p = meta.get(picked.id)
    return {
      id: picked.id,
      name: p?.display_name ?? 'Rep',
      avatarUrl: p?.avatar_url ?? null,
      periodXp: picked.periodXp,
    }
  }

  return {
    daily: hydrate(pickChampion(xpRows, daySince)),
    weekly: hydrate(pickChampion(xpRows, weekSince)),
  }
}
