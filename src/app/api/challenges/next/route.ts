import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { adaptiveChallengesEnabled, loadChallengeData, nextChallenge, type NextChallenge } from '@/lib/challenge-load'

/** Strips the internal event ids: the card needs the counts and context, not the raw list. */
function publicShape(n: NextChallenge) {
  if (n.recommendation.status !== 'recommended') return n
  const strip = <T extends { pattern: { eventIds: string[] } }>(w: T) => ({ ...w, pattern: { ...w.pattern, eventIds: undefined } })
  return { ...n, recommendation: { ...n.recommendation, weakness: strip(n.recommendation.weakness), alternatives: n.recommendation.alternatives.map(strip) } }
}

/** The rep's recommended next exercise, computed fresh from their own history. */
export async function GET(req: Request) {
  if (!adaptiveChallengesEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const lang = new URL(req.url).searchParams.get('lang') === 'ar' ? 'ar' : 'en'
  return NextResponse.json(publicShape(nextChallenge(await loadChallengeData(supabase, user.id), lang)))
}
