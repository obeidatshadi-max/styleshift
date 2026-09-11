import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import {
  SYSTEM, buildOpeningPrompt, parseOpeningResponse, pickObjectionType,
  seedPhysicianState, isDifficulty, DEFAULT_DIFFICULTY, type ObjectionOutcome, type ObjectionType,
} from '@/lib/voice-partner-core'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Doctor, DoctorVisit } from '@/types/game'

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket across open/turn/speak: each is an upstream AI call, so the
  // 20/hour ceiling bounds total Anthropic+OpenAI cost exposure per rep, not
  // just this one route.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => ({})) as { doctorId?: string; lang?: 'en' | 'ar'; difficulty?: string }
  if (!body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const lang = body.lang === 'ar' ? 'ar' : 'en'
  // No UI selector exists yet (Phase 1 backend-only per docs/ai-doctor-phase-1-plan.md
  // 1.7) — default to 'realistic', today's unchanged behavior, when omitted.
  const difficulty = isDifficulty(body.difficulty) ? body.difficulty : DEFAULT_DIFFICULTY

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', body.doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  // voice_partner_sessions is the only table storing objection_type +
  // outcome together (doctor_visits only logs free text) — see
  // computeObjectionWeights' doc comment for why this table, not doctor_visits.
  const { data: recentSessions } = await supabase
    .from('voice_partner_sessions').select('objection_type,outcome').eq('doctor_id', body.doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const recentOutcomes: ObjectionOutcome[] = ((recentSessions as { objection_type: ObjectionType; outcome: 'won' | 'escalated' }[]) ?? [])
    .map(s => ({ objectionType: s.objection_type, outcome: s.outcome }))
  const objectionType = pickObjectionType(recentOutcomes)

  const state = seedPhysicianState(doctor as Doctor, difficulty)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildOpeningPrompt(doctor as Doctor, style, lang, historyContext, objectionType, state) }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const doctorText = parseOpeningResponse(data?.content?.[0]?.text ?? '')
  if (!doctorText) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  const sessionId = crypto.randomUUID()
  // Best-effort: the evidence store must never block live practice. A
  // missing turn-0 row just means Phase 2+ analysis has a gap for this one
  // session; the client still gets its opening line either way.
  const { error: turnInsertError } = await supabase.from('conversation_turns').insert({
    session_id: sessionId, rep_id: user.id, doctor_id: body.doctorId, turn_index: 0,
    role: 'doctor', text: doctorText, objection_type: objectionType, clear_steps_hit: [],
    trust: state.trust, skepticism: state.skepticism, engagement: state.engagement, time_pressure: state.timePressure,
  })
  if (turnInsertError) console.warn('conversation_turns insert failed (open):', turnInsertError.message)

  return NextResponse.json({ doctorText, objectionType, sessionId, state, difficulty })
}
