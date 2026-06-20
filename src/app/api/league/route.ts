import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getLeagueBoard } from '@/lib/leagues'

export type { LeagueTeam, LeagueBoard } from '@/lib/leagues'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getLeagueBoard(user.id)
  return NextResponse.json(data)
}
