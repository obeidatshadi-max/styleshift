import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { authenticateVoicePartnerRequest } from '@/lib/voice-partner-auth'

// Best-effort patch of a single conversation_turns row's timing, called by
// the realtime bot once BotStoppedSpeakingFrame confirms the doctor's line
// finished playing (unknown at /turn response time — see turn/route.ts's
// comment on why this can't be included in the /turn POST itself). Never
// blocks the pipeline; a failure here only means that one turn's
// RealtimeSignals contribution is missing, same "best-effort evidence
// store" tolerance turn/route.ts already applies to its own insert.
export async function POST(req: Request) {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const auth = await authenticateVoicePartnerRequest(req)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = auth.viaToken ? createAdminClient() : await createClient()

  const body = await req.json().catch(() => null) as {
    sessionId?: string; turnIndex?: number; startedAt?: string; endedAt?: string
  } | null
  if (!body?.sessionId || typeof body.turnIndex !== 'number') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!body.startedAt || !body.endedAt || Number.isNaN(Date.parse(body.startedAt)) || Number.isNaN(Date.parse(body.endedAt))) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { error } = await supabase.from('conversation_turns')
    .update({ started_at: body.startedAt, ended_at: body.endedAt })
    .eq('session_id', body.sessionId).eq('turn_index', body.turnIndex).eq('rep_id', auth.userId)
  if (error) console.warn('conversation_turns timing patch failed:', error.message)

  return NextResponse.json({ ok: true })
}
