import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { simulationContext, errorResponse, isUuid } from '@/lib/simulation-route'
import { DEFAULT_DIFFICULTY, DIFFICULTY_LEVELS, isDifficulty } from '@/lib/voice-partner-core'
import { loadRepData, personaForPractice, practiceMyDoctorEnabled, prepare } from '@/lib/practice-my-doctor'
import type { Profile } from '@/types/game'

/**
 * Starts a text simulation from a doctor's recorded history. The context is
 * rebuilt here from the rep's own records; the client only says which doctor,
 * which facts to leave out, and the seed it was shown in the preview.
 */
export async function POST(req: Request) {
  if (!practiceMyDoctorEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await simulationContext()
  if ('response' in ctx) return ctx.response

  const body = await req.json().catch(() => null) as { doctorId?: unknown; seed?: unknown; exclude?: unknown; lang?: unknown; difficulty?: unknown } | null
  if (!body || (body.doctorId !== undefined && !isUuid(body.doctorId))) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const difficulty = body.difficulty === undefined ? DEFAULT_DIFFICULTY : body.difficulty
  if (!isDifficulty(difficulty)) return NextResponse.json({ error: 'bad_request', allowed: DIFFICULTY_LEVELS }, { status: 400 })
  const exclude = Array.isArray(body.exclude) && body.exclude.length <= 60 && body.exclude.every(x => typeof x === 'string' && x.length <= 80) ? body.exclude as string[] : []
  const seed = typeof body.seed === 'string' && body.seed.length <= 80 ? body.seed : crypto.randomUUID()

  const supabase = await createClient()
  const data = await loadRepData(supabase, ctx.userId)
  const prepared = prepare(data, { doctorId: body.doctorId as string | undefined, seed, nowMs: Date.now() })
  if (!prepared) return NextResponse.json({ error: 'persona_not_found' }, { status: 404 })
  const { data: profile } = await supabase.from('profiles').select('id, display_name, company_id, sps_top_key, sps_profile').eq('id', ctx.userId).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'persona_not_found' }, { status: 404 })

  const { persona, used } = personaForPractice(prepared.doctor, profile as Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>, prepared.context, difficulty, exclude)
  const started = await ctx.orchestrator.start({
    repId: ctx.userId, persona, lang: body.lang === 'ar' ? 'ar' : 'en', difficulty,
    practiceContext: { factIds: used.facts.map(f => f.id), inferenceIds: used.inferences.map(i => i.id), challenge: used.challenge },
  })
  if (!started.ok) return errorResponse(started.error)
  return NextResponse.json({ sessionId: started.sessionId, doctorText: started.doctorText })
}
