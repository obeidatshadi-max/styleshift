import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isObjectionType, isClearStep, isDifficulty, type ClearStep } from '@/lib/voice-partner-core'
import type { Doctor } from '@/types/game'

// Stricter than voice-partner-core's AI-judge-output parsing: this route
// rejects the whole request if ANY element is invalid, rather than silently
// filtering out the bad ones.
function parseClearSteps(raw: unknown): ClearStep[] | null {
  if (!Array.isArray(raw)) return null
  return raw.every(isClearStep) ? (raw as ClearStep[]) : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export async function POST(req: Request) {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/speak (see open/route.ts) — this route makes
  // no upstream AI call, but one insert per session is a negligible addition
  // to that budget and keeps all voice-partner traffic under one limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as {
    doctorId?: string; objectionType?: string; outcome?: string; clearSteps?: unknown; turnCount?: number
    sessionId?: string; difficulty?: string
  } | null
  if (!body?.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isObjectionType(body.objectionType)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.outcome !== 'won' && body.outcome !== 'escalated') return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof body.turnCount !== 'number' || !Number.isInteger(body.turnCount) || body.turnCount < 1)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const clearSteps = parseClearSteps(body.clearSteps)
  if (!clearSteps) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  // Optional: older clients (or this route called before sessionId/difficulty
  // shipped) still work — id defaults to the column's own gen_random_uuid()
  // and difficulty stays null, exactly today's behavior.
  if (body.sessionId !== undefined && !isUuid(body.sessionId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.difficulty !== undefined && !isDifficulty(body.difficulty)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor; look style up
  // server-side rather than trusting a client-supplied value.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('voice_partner_sessions').insert({
    ...(body.sessionId ? { id: body.sessionId } : {}),
    rep_id: user.id,
    doctor_id: body.doctorId,
    style: (doctor as Doctor).style,
    objection_type: body.objectionType,
    outcome: body.outcome,
    clear_steps_hit: clearSteps,
    turn_count: body.turnCount,
    ...(body.difficulty ? { difficulty: body.difficulty } : {}),
  })
  if (error) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
