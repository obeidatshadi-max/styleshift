import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isClosingCriterion, type ClosingCriterion } from '@/lib/voice-partner-closing'
import type { Doctor } from '@/types/game'

// Stricter than the AI-judge-output parsing in voice-partner-closing.ts:
// this route rejects the whole request if ANY element is invalid, rather
// than silently filtering out the bad ones.
function parseCriteriaHit(raw: unknown): ClosingCriterion[] | null {
  if (!Array.isArray(raw)) return null
  return raw.every(isClosingCriterion) ? (raw as ClosingCriterion[]) : null
}

export async function POST(req: Request) {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with the rest of voice partner — this route makes no
  // upstream AI call, but one insert per attempt is a negligible addition
  // to that budget and keeps all voice-partner traffic under one limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { doctorId?: string; criteriaHit?: unknown } | null
  if (!body?.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const criteriaHit = parseCriteriaHit(body.criteriaHit)
  if (!criteriaHit) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor; look style up
  // server-side rather than trusting a client-supplied value.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('voice_partner_closing_sessions').insert({
    rep_id: user.id,
    doctor_id: body.doctorId,
    style: (doctor as Doctor).style,
    criteria_hit: criteriaHit,
  })
  if (error) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
