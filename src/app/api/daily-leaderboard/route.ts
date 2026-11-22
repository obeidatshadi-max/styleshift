import { getAuthUser } from '@/lib/auth-user'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getDailyLeaderboard } from '@/lib/daily-leaderboard'
import { createServerTimer, withServerTiming } from '@/lib/server-timing'

export type { DailyStanding, DailyLeaderboard } from '@/lib/daily-leaderboard'

export async function GET() {
  const timer = createServerTimer()
  const supabase = await createClient()
  const user = await timer.time('auth', () => getAuthUser(supabase))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getDailyLeaderboard(user.id, timer)
  return withServerTiming(NextResponse.json(data), timer)
}
