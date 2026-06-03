import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getDailyLeaderboard } from '@/lib/daily-leaderboard'

export type { DailyStanding, DailyLeaderboard } from '@/lib/daily-leaderboard'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getDailyLeaderboard(user.id)
  return NextResponse.json(data)
}
