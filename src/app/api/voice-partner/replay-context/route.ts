import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isPhysicianState } from '@/lib/voice-partner-core'
import { checkRateLimit } from '@/lib/rate-limit'
import type { ConversationTurn } from '@/types/game'

// Replay-This-Moment: given a source session + the turn_index of a detected
// Critical Moment (either a model-identified CriticalMoment or the
// deterministic Pressure Shift moment — both use the same turn_index
// convention), mints a FRESH session seeded with that moment's doctor line
// and physician-state snapshot, so the rep can retry their response to it.
// Response shape deliberately mirrors /api/voice-partner/open's exactly
// ({doctorText, objectionType, sessionId, state}) so useVoicePartner.ts can
// treat this as a drop-in alternative opening source — same insert pattern
// (best-effort turn_index=0 evidence row), just sourcing the opening line
// from a past turn instead of a fresh LLM call.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/pipecat-session — minting a replay session
  // leads straight into a new realtime call, the same billable-event
  // reasoning as pipecat-session's own limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { sourceSessionId?: string; turnIndex?: number } | null
  if (!body?.sourceSessionId || typeof body.turnIndex !== 'number') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // RLS scopes this to the caller's own rep_id rows.
  const { data: turn } = await supabase.from('conversation_turns').select('*')
    .eq('session_id', body.sourceSessionId).eq('turn_index', body.turnIndex).eq('role', 'doctor').single()
  if (!turn) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const row = turn as ConversationTurn
  if (!row.doctor_id) return NextResponse.json({ error: 'no_snapshot' }, { status: 422 })
  const state = { trust: row.trust, skepticism: row.skepticism, engagement: row.engagement, timePressure: row.time_pressure }
  if (!isPhysicianState(state)) return NextResponse.json({ error: 'no_snapshot' }, { status: 422 })

  const sessionId = crypto.randomUUID()
  // Best-effort, same tolerance as open/route.ts's own turn_index=0 insert —
  // a missing row just means a gap in this one replay session's evidence,
  // never a reason to block the retry itself.
  const { error: turnInsertError } = await supabase.from('conversation_turns').insert({
    session_id: sessionId, rep_id: user.id, doctor_id: row.doctor_id, turn_index: 0,
    role: 'doctor', text: row.text, objection_type: row.objection_type, clear_steps_hit: [],
    trust: state.trust, skepticism: state.skepticism, engagement: state.engagement, time_pressure: state.timePressure,
  })
  if (turnInsertError) console.warn('conversation_turns insert failed (replay-context):', turnInsertError.message)

  return NextResponse.json({
    doctorText: row.text, objectionType: row.objection_type, sessionId, state, doctorId: row.doctor_id,
  })
}
