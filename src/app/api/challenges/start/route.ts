import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { simulationContext, errorResponse } from '@/lib/simulation-route'
import { adaptiveChallengesEnabled, loadChallengeData, nextChallenge } from '@/lib/challenge-load'
import { targetedScenario } from '@/lib/challenge-engine'
import { scenarioRun } from '@/lib/scenario-persona'
import type { Profile } from '@/types/game'

/**
 * Starts a text simulation targeted at the rep's current recommendation.
 * The client sends nothing about the target: the recommendation is recomputed
 * here from the rep's own stored history, so it cannot be steered by the request.
 */
export async function POST(req: Request) {
  if (!adaptiveChallengesEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await simulationContext()
  if ('response' in ctx) return ctx.response

  const body = await req.json().catch(() => null) as { lang?: unknown } | null
  const lang = body?.lang === 'ar' ? 'ar' : 'en'
  const supabase = await createClient()
  const { recommendation } = nextChallenge(await loadChallengeData(supabase, ctx.userId), lang)
  if (recommendation.status !== 'recommended') return NextResponse.json({ error: 'no_pattern' }, { status: 409 })

  const { data: profile } = await supabase.from('profiles').select('id, display_name, company_id, sps_top_key, sps_profile').eq('id', ctx.userId).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'persona_not_found' }, { status: 404 })

  const scenario = targetedScenario(recommendation.weakness, recommendation.exercise.targeted)
  const run = scenarioRun(scenario, profile as Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>)
  const started = await ctx.orchestrator.start({
    repId: ctx.userId, persona: run.persona, lang: run.setup.lang, difficulty: run.setup.difficulty,
    objectionType: run.objectionType, learningObjectives: run.learningObjectives,
    challenge: { behavior: recommendation.weakness.pattern.behavior },
  })
  if (!started.ok) return errorResponse(started.error)
  return NextResponse.json({ sessionId: started.sessionId, doctorText: started.doctorText })
}
