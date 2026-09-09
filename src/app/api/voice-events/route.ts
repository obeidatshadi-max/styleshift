import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { VOICE_MODES, VOICE_EVENT_STAGES } from '@/lib/voice-events'

/** Records one funnel event for an AI-voice-partner session. Best-effort. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!VOICE_MODES.includes(body?.mode) || !VOICE_EVENT_STAGES.includes(body?.stage)) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  }

  const admin = createAdminClient()
  await admin.from('voice_events').insert({
    rep_id: user.id,
    mode: body.mode,
    stage: body.stage,
    latency_ms: typeof body.latency_ms === 'number' ? body.latency_ms : null,
    meta: body.meta && typeof body.meta === 'object' ? body.meta : null,
  })
  return NextResponse.json({ ok: true })
}
