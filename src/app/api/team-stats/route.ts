import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getTeamStatsForUser } from '@/lib/team-stats'

export type { RepStat, TeamStats } from '@/lib/team-stats'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stats = await getTeamStatsForUser(user.id)
  if (!stats) return NextResponse.json({ error: 'Not a manager' }, { status: 403 })

  return NextResponse.json(stats)
}
