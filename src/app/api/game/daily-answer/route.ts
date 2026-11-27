import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { todayKey } from '@/lib/daily'
import { dailyXp, isGameLang, scoreDailyAnswer } from '@/lib/game-scoring'
import { awardXp } from '@/lib/xp-server'

/** One daily-challenge answer. The server checks the pick against today's scenario and awards
 * the XP; the browser no longer says whether it was right (architecture review 2026-11-27, F1). */
export async function POST(req: Request) {
  const user = await getAuthUser(await createClient())
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('game', user.id, 120, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { level?: unknown; scenarioId?: unknown; pick?: unknown; ms?: unknown; lang?: unknown } | null
  if (!body || typeof body.level !== 'number' || typeof body.scenarioId !== 'number' || !isGameLang(body.lang)
    || (typeof body.pick !== 'number' && typeof body.pick !== 'string'))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const verdict = scoreDailyAnswer(body.level, body.scenarioId, body.pick, body.lang)
  if (!verdict) return NextResponse.json({ error: 'not_todays_question' }, { status: 400 })

  const admin = createAdminClient()
  const today = todayKey()
  const ms = typeof body.ms === 'number' && body.ms > 0 && body.ms < 600000 ? Math.round(body.ms) : null
  const { error } = await admin.from('daily_challenges').insert({
    rep_id: user.id, challenge_date: today, level: body.level, scenario_id: body.scenarioId,
    correct: verdict.correct, reaction_ms: ms,
  })
  // Unique (rep, day, level): a second answer to the same question earns nothing.
  if (error) return NextResponse.json({ correct: verdict.correct, saved: false, xpAwarded: 0 })

  const { count } = await admin.from('daily_challenges').select('id', { count: 'exact', head: true })
    .eq('rep_id', user.id).eq('challenge_date', today)
  const { base, bonus } = dailyXp(verdict.correct, count ?? 0)
  let totalXp = await awardXp(admin, user.id, base, base > 0 ? 'daily' : null)
  if (bonus > 0) totalXp = await awardXp(admin, user.id, bonus, 'daily_streak')
  return NextResponse.json({ correct: verdict.correct, saved: true, xpAwarded: base + bonus, totalXp })
}
