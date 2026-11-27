import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { XP_VALUES } from '@/lib/game-data'

/** First app visit of the day: stamps last_visit and adds the visit bonus once, in one
 * database statement (it used to be a browser read-then-write). */
export async function POST() {
  const user = await getAuthUser(await createClient())
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await createAdminClient().rpc('record_visit', { p_rep: user.id, p_today: today, p_bonus: XP_VALUES.dailyStreak })
  if (error) {
    console.error('[game/visit] record_visit failed:', error.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ xpAwarded: typeof data === 'number' ? data : 0, lastVisit: today })
}
