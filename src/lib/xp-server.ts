import type { createAdminClient } from '@/lib/supabase-admin'
import type { BadgeName } from '@/types/game'

/** Server-only XP and badge writes. Every caller has already checked who the rep is; these
 * use the service-role client because reps can no longer write XP, ledger rows or badges
 * themselves (migration 20261127130000). The SQL functions come from 20261127120000. */
type Admin = ReturnType<typeof createAdminClient>

export type XpSource = 'session' | 'daily' | 'daily_streak' | 'assignment' | 'voice_win' | 'roleplay'

/** Adds XP in one statement and writes the ledger row in the same transaction.
 * Returns the new lifetime total, or null when the write failed. */
export async function awardXp(admin: Admin, repId: string, amount: number, source: XpSource | null): Promise<number | null> {
  if (amount <= 0) {
    const { data } = await admin.from('profiles').select('xp').eq('id', repId).maybeSingle()
    return (data as { xp: number } | null)?.xp ?? null
  }
  const { data, error } = await admin.rpc('award_xp', { p_rep: repId, p_amount: amount, p_source: source })
  if (error) { console.error('award_xp failed:', error.message); return null }
  return typeof data === 'number' ? data : null
}

/** Stores badges once each (primary key rep_id + badge_name). Returns the ones newly earned. */
export async function grantBadges(admin: Admin, repId: string, names: readonly BadgeName[]): Promise<BadgeName[]> {
  if (names.length === 0) return []
  const { data, error } = await admin.from('badges')
    .upsert(names.map(badge_name => ({ rep_id: repId, badge_name })), { onConflict: 'rep_id,badge_name', ignoreDuplicates: true })
    .select('badge_name')
  if (error) { console.error('badge write failed:', error.message); return [] }
  return ((data ?? []) as { badge_name: BadgeName }[]).map(r => r.badge_name)
}
