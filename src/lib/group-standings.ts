import { createAdminClient } from '@/lib/supabase-admin'
import type { Standing, Standings } from '@/lib/standings'

export type { Standing, Standings } from '@/lib/standings'

// Shared-leaderboard-only: no assignments, no company-style data sharing.
export const MAX_GROUP_MEMBERS = 20

export interface GroupInfo {
  id: string
  name: string
  inviteCode: string
  isOwner: boolean
}

interface GroupMemberRow { id: string; display_name: string | null; xp: number | null }

/** Ranks group members by XP, highest first — same shape as company standings. */
export function rankGroupMembers(rows: GroupMemberRow[], userId: string): Standings {
  const standings: Standing[] = [...rows]
    .sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))
    .map(r => ({ id: r.id, name: r.display_name ?? 'Rep', xp: r.xp ?? 0, isSelf: r.id === userId }))

  const idx = standings.findIndex(s => s.isSelf)
  return {
    standings,
    selfRank: idx >= 0 ? idx + 1 : null,
    teamSize: standings.length,
  }
}

/** A group at MAX_GROUP_MEMBERS can't accept another joiner. */
export function canJoinGroup(currentSize: number): boolean {
  return currentSize < MAX_GROUP_MEMBERS
}

/**
 * The caller's group (if any) plus its XP-ranked standings. Read with the
 * service-role admin client (same approach as getStandings) so no cross-rep
 * RLS policy is needed, and only safe fields (name + XP) are returned.
 */
export async function getGroupStandings(userId: string): Promise<{ group: GroupInfo | null; standings: Standings | null }> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('group_id')
    .eq('id', userId)
    .single()

  if (!me?.group_id) return { group: null, standings: null }

  const { data: group } = await admin
    .from('groups')
    .select('id, name, invite_code, owner_id')
    .eq('id', me.group_id)
    .single()

  if (!group) return { group: null, standings: null }

  const { data: members } = await admin
    .from('profiles')
    .select('id, display_name, xp')
    .eq('group_id', group.id)

  return {
    group: { id: group.id, name: group.name, inviteCode: group.invite_code, isOwner: group.owner_id === userId },
    standings: rankGroupMembers(members ?? [], userId),
  }
}
