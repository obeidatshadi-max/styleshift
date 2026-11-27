import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { isGameLang, isGameLevel, scoreLevel, STYLE_MASTER_XP, type GameAnswer } from '@/lib/game-scoring'
import { awardXp, grantBadges } from '@/lib/xp-server'

/** A finished level run. The browser sends only the picks; accuracy, XP and badges are
 * worked out here from the game data (architecture review 2026-11-27, F1). */
export async function POST(req: Request) {
  const user = await getAuthUser(await createClient())
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('game', user.id, 120, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { level?: unknown; lang?: unknown; answers?: unknown } | null
  if (!body || !isGameLevel(body.level) || !isGameLang(body.lang) || !Array.isArray(body.answers))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const score = scoreLevel(body.level, body.lang, body.answers as GameAnswer[])
  if (!score) return NextResponse.json({ error: 'invalid_run' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('sessions').insert({
    rep_id: user.id, level: body.level, accuracy: score.accuracy, xp_earned: score.xp,
    avg_reaction_ms: score.avgMs || null,
  })
  if (error) {
    console.error('[game/level-complete] session insert failed:', error.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
  const totalXp = await awardXp(admin, user.id, score.xp, 'session')
  const badges = [...score.badges]
  if (totalXp !== null && totalXp >= STYLE_MASTER_XP) badges.push('Style Master')
  const newBadges = await grantBadges(admin, user.id, badges)

  return NextResponse.json({ ...score, totalXp, newBadges })
}
