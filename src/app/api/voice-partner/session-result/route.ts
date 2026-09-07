import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isObjectionType, CLEAR_STEPS, type ClearStep } from '@/lib/voice-partner-core'
import type { Doctor } from '@/types/game'

function parseClearSteps(raw: unknown): ClearStep[] | null {
  if (!Array.isArray(raw)) return null
  const steps: ClearStep[] = []
  for (const s of raw) {
    if (typeof s !== 'string' || !(CLEAR_STEPS as readonly string[]).includes(s)) return null
    steps.push(s as ClearStep)
  }
  return steps
}

export async function POST(req: Request) {
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
  } | null
  if (!body?.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isObjectionType(body.objectionType)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.outcome !== 'won' && body.outcome !== 'escalated') return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof body.turnCount !== 'number' || !Number.isInteger(body.turnCount) || body.turnCount < 1)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const clearSteps = parseClearSteps(body.clearSteps)
  if (!clearSteps) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor; look style up
  // server-side rather than trusting a client-supplied value.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('voice_partner_sessions').insert({
    rep_id: user.id,
    doctor_id: body.doctorId,
    style: (doctor as Doctor).style,
    objection_type: body.objectionType,
    outcome: body.outcome,
    clear_steps_hit: clearSteps,
    turn_count: body.turnCount,
  })
  if (error) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
