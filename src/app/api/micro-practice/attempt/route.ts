import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { createBehaviorAnalystAgent } from '@/agents/behaviorAnalyst'
import { drillRegistry } from '@/lib/drill-templates'
import { assessDrillResponse, drillSession, MAX_DRILL_RESPONSE_CHARS, observedBehaviors } from '@/lib/drill-run'
import { retryState, summarizeDrillHistory } from '@/lib/drill-registry'
import { attemptsToday, listAttempts, microPracticeEnabled, saveAttempt } from '@/lib/drill-attempts'

/**
 * One drill attempt: the typed response is analysed by the Behavior Analyst,
 * scored deterministically against the template, and only the derived result
 * is stored (never the response text). Nothing is stored if the response
 * could not be assessed, so a failed call never uses up a retry.
 */
export async function POST(req: Request) {
  if (!microPracticeEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit('micro-practice', user.id, 40, 3600))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { drillId?: unknown; response?: unknown; lang?: unknown } | null
  const template = typeof body?.drillId === 'string' ? drillRegistry.get(body.drillId) : undefined
  const lang = body?.lang === 'ar' ? 'ar' : 'en'
  const response = typeof body?.response === 'string' ? body.response.trim() : ''
  if (!template || !template.languages.includes(lang) || !response || response.length > MAX_DRILL_RESPONSE_CHARS) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const attempts = await listAttempts(supabase, user.id)
  const today = attemptsToday(attempts, template.id, new Date())
  if (!retryState(template, today).canRetry) return NextResponse.json({ error: 'retry_limit' }, { status: 429 })

  const analyst = createBehaviorAnalystAgent(createAnthropicComplete(key))
  const analysis = await analyst.analyze(drillSession(template, response, lang, user.id))
  // Zero grounded observations is indistinguishable from a bad model reply: say "could not assess", never score 0 by guess.
  if ('error' in analysis) return NextResponse.json({ error: 'could_not_assess' }, { status: 502 })

  const { result, feedback } = assessDrillResponse(template, analysis.observations, lang)
  const previousBest = summarizeDrillHistory(attempts.filter(a => a.drillId === template.id)).personalBest
  const attemptNo = attempts.filter(a => a.drillId === template.id).length + 1
  const saved = await saveAttempt(supabase, {
    drillId: template.id, drillVersion: template.version, repId: user.id, attemptNo, lang,
    observedBehaviors: observedBehaviors(analysis.observations, new Set(template.criteria.map(c => c.behavior))), score: result.score, passed: result.passed,
  })
  if (!saved) return NextResponse.json({ error: 'store_failed' }, { status: 500 })

  const state = retryState(template, today + 1)
  return NextResponse.json({
    score: result.score, passed: result.passed, feedback, attemptNo,
    personalBest: result.score === null ? previousBest : Math.max(previousBest ?? 0, result.score),
    newPersonalBest: result.score !== null && (previousBest === null || result.score > previousBest),
    canRetry: state.canRetry,
    hint: state.showHint && !result.passed ? (template.hint[lang] ?? template.hint.en ?? null) : null,
  })
}
