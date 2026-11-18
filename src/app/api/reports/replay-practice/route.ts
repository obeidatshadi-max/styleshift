import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { createOpenAiJsonComplete } from '@/agents/openai-complete'
import type { ConversationReport } from '@/schemas/conversationReport'
import {
  buildPracticePrompt, groundPracticeFeedback, MAX_ATTEMPT_CHARS, MIN_ATTEMPT_CHARS, replayDrillId,
} from '@/lib/conversation-coach/practice'

export const maxDuration = 30

const RATE_LIMIT = 30
const RATE_WINDOW_SEC = 3600

/**
 * Feedback on one replay-practice attempt. The success criterion and the doctor's cue are read from the
 * rep's own saved report (row-level security plus a rep_id filter); nothing the browser sends can change
 * what the attempt is judged against. The attempt text is not stored: only the result is saved, in
 * drill_attempts, the same "result, not content" rule as micro-practice.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('replay-practice', user.id, RATE_LIMIT, RATE_WINDOW_SEC)))
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null) as { sessionId?: unknown; attempt?: unknown; lang?: unknown } | null
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null
  const attempt = typeof body?.attempt === 'string' ? body.attempt.trim() : ''
  const lang = body?.lang === 'ar' ? 'ar' : 'en'
  if (!sessionId) return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
  if (attempt.length < MIN_ATTEMPT_CHARS) return NextResponse.json({ error: 'empty_attempt' }, { status: 400 })
  if (attempt.length > MAX_ATTEMPT_CHARS) return NextResponse.json({ error: 'attempt_too_long' }, { status: 413 })

  const { data } = await supabase.from('conversation_reports').select('report')
    .eq('session_id', sessionId).eq('rep_id', user.id).in('session_type', ['human_partner', 'customer_visit'])
    .eq('status', 'complete').is('superseded_by', null).order('created_at', { ascending: false }).limit(1)
  const report = (data as { report: ConversationReport }[] | null)?.[0]?.report
  const priority = report?.coach?.priority
  if (!report?.coach || !priority) return NextResponse.json({ error: 'No practice target in this report' }, { status: 404 })
  const moment = report.coach.keyMoments.find(m => m.id === priority.momentId) ?? null

  const complete = process.env.ANTHROPIC_API_KEY ? createAnthropicComplete(process.env.ANTHROPIC_API_KEY)
    : process.env.OPENAI_API_KEY ? createOpenAiJsonComplete(process.env.OPENAI_API_KEY) : null
  if (!complete) return NextResponse.json({ error: 'Practice feedback is not configured' }, { status: 503 })

  const { system, prompt, maxTokens } = buildPracticePrompt({
    cue: moment?.cue.quote ?? null, successCriterion: priority.successCriterion, behavior: priority.behavior, attempt, lang,
  })
  const raw = await complete({ system, prompt, maxTokens })
  let parsed: unknown = null
  if (raw) {
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
    if (start !== -1 && end > start) { try { parsed = JSON.parse(raw.slice(start, end + 1)) } catch { /* handled below */ } }
  }
  // No content in logs: reasons only.
  if (!parsed) { console.error('[replay-practice] no usable JSON from model'); return NextResponse.json({ error: 'Feedback failed. Please try again.' }, { status: 502 }) }
  const feedback = groundPracticeFeedback(parsed, attempt)

  const drillId = replayDrillId(sessionId)
  const { count } = await supabase.from('drill_attempts').select('id', { count: 'exact', head: true }).eq('rep_id', user.id).eq('drill_id', drillId)
  const { error } = await supabase.from('drill_attempts').insert({
    rep_id: user.id, drill_id: drillId, drill_version: 1, attempt_no: (count ?? 0) + 1, lang,
    // score stays null: this is a criterion check, not a score, so it never enters drill progress or the improvement engine.
    observed_behaviors: [feedback.result], score: null, passed: feedback.result === 'met',
  })
  if (error) console.error('[replay-practice] attempt not saved:', error.code)

  return NextResponse.json({ ...feedback, saved: !error, practiceAttempt: true })
}
