import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM } from '@/lib/voice-partner-core'
import {
  MAX_REP_QUESTION_CHARS, buildPrecisionJudgePrompt, buildVagueLinePrompt, isVaguePattern,
  parsePrecisionJudgeResponse, parseVagueLineResponse, pickPattern,
} from '@/lib/precision-drill'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Doctor, DoctorVisit } from '@/types/game'

/** Typed (not recorded) Precision Question drill. Two actions:
 * - "line": the doctor says one vague line for a pattern not yet used this drill.
 * - "judge": classifies the rep's follow-up question and answers in character. */
export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Own bucket: one drill is up to six short text calls, which would drain the shared voice bucket.
  if (!(await checkRateLimit('precision-drill', user.id, 40, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.doctorId !== 'string' || !body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const lang = body.lang === 'ar' ? 'ar' : 'en'
  const action = body.action

  let prompt: string
  let pattern = isVaguePattern(body.pattern) ? body.pattern : null
  if (action === 'judge') {
    const doctorLine = typeof body.doctorLine === 'string' ? body.doctorLine.trim().slice(0, 300) : ''
    const repQuestion = typeof body.repQuestion === 'string' ? body.repQuestion.trim() : ''
    if (!pattern || !doctorLine || !repQuestion) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    if (repQuestion.length > MAX_REP_QUESTION_CHARS) return NextResponse.json({ error: 'too_long' }, { status: 413 })
    const ctx = await doctorContext(supabase, body.doctorId)
    if ('error' in ctx) return ctx.error
    prompt = buildPrecisionJudgePrompt(ctx.doctor, ctx.doctor.style!, lang, ctx.history, pattern, doctorLine, repQuestion)
  } else if (action === 'line') {
    const used = Array.isArray(body.usedPatterns) ? body.usedPatterns.filter(isVaguePattern) : []
    pattern = pickPattern(used)
    const ctx = await doctorContext(supabase, body.doctorId)
    if ('error' in ctx) return ctx.error
    prompt = buildVagueLinePrompt(ctx.doctor, ctx.doctor.style!, lang, ctx.history, pattern)
  } else {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })
  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const text = data?.content?.[0]?.text ?? ''

  if (action === 'line') {
    const line = parseVagueLineResponse(text)
    if (!line) return NextResponse.json({ error: 'invalid' }, { status: 422 })
    return NextResponse.json({ pattern, doctorLine: line.doctorLine })
  }
  const judged = parsePrecisionJudgeResponse(text)
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })
  return NextResponse.json({ verdict: judged.verdict, doctorText: judged.doctorText })
}

type Supabase = Awaited<ReturnType<typeof createClient>>

async function doctorContext(supabase: Supabase, doctorId: string): Promise<{ doctor: Doctor; history: string } | { error: NextResponse }> {
  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  if (!(doctor as Doctor).style) return { error: NextResponse.json({ error: 'no_style' }, { status: 422 }) }
  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', doctorId)
    .order('created_at', { ascending: false }).limit(5)
  return { doctor: doctor as Doctor, history: buildHistoryContext((visits as DoctorVisit[]) ?? []) }
}
