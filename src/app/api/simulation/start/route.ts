import { NextResponse } from 'next/server'
import { simulationContext, errorResponse, isUuid } from '@/lib/simulation-route'
import { DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY, isDifficulty } from '@/lib/voice-partner-core'
import { getRunnable, runnableProblems, scenarioBuilderEnabled } from '@/lib/sim-scenarios'
import { scenarioRun } from '@/lib/scenario-persona'

export async function POST(req: Request) {
  const ctx = await simulationContext()
  if ('response' in ctx) return ctx.response

  const body = await req.json().catch(() => null) as { doctorId?: unknown; scenarioId?: unknown; lang?: unknown; difficulty?: unknown; practiceFocus?: unknown } | null
  if (body && body.scenarioId !== undefined) {
    // Scenario run: the scenario fixes persona, difficulty, language and objectives.
    if (!scenarioBuilderEnabled() || !isUuid(body.scenarioId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    const found = await getRunnable(ctx.userId, body.scenarioId)
    if (!found.ok || runnableProblems(found.value.scenario).length) return NextResponse.json({ error: 'persona_not_found' }, { status: 404 })
    const run = scenarioRun(found.value.scenario, found.value.profile)
    const started = await ctx.orchestrator.start({
      repId: ctx.userId, persona: run.persona, scenarioId: body.scenarioId, lang: run.setup.lang,
      difficulty: run.setup.difficulty, objectionType: run.objectionType, learningObjectives: run.learningObjectives,
    })
    if (!started.ok) return errorResponse(started.error)
    return NextResponse.json({ sessionId: started.sessionId, doctorText: started.doctorText })
  }
  if (!body || !isUuid(body.doctorId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const difficulty = body.difficulty === undefined ? DEFAULT_DIFFICULTY : body.difficulty
  if (!isDifficulty(difficulty)) return NextResponse.json({ error: 'bad_request', allowed: DIFFICULTY_LEVELS }, { status: 400 })

  if (body.practiceFocus !== undefined && (typeof body.practiceFocus !== 'string' || body.practiceFocus.length > 1200))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const focus = typeof body.practiceFocus === 'string' ? body.practiceFocus.trim() : ''
  const result = await ctx.orchestrator.start({
    repId: ctx.userId, doctorId: body.doctorId, lang: body.lang === 'ar' ? 'ar' : 'en', difficulty,
    learningObjectives: focus ? [{ id: 'practice-focus', label: focus, focusStep: null, targetObjection: null, source: 'rep' }] : [],
  })
  if (!result.ok) return errorResponse(result.error)
  return NextResponse.json({ sessionId: result.sessionId, doctorText: result.doctorText })
}
