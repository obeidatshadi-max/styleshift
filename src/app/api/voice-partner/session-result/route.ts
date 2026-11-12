import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { authenticateVoicePartnerRequest } from '@/lib/voice-partner-auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Confirm-only. This route used to store outcome, CLEAR steps and turn count exactly as the
// browser sent them, and certification reads win rate from those rows. The judge routes
// (turn, live-judge) now store the result themselves the moment the judge resolves a session
// (lib/voice-partner-session-store.ts). This route only tells a client whether that row
// exists for this rep; whatever outcome a client sends is ignored and never written.
export async function POST(req: Request) {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const auth = await authenticateVoicePartnerRequest(req)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = auth.viaToken ? createAdminClient() : await createClient()

  if (!(await checkRateLimit('voice-partner', auth.userId, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { sessionId?: unknown } | null
  if (typeof body?.sessionId !== 'string' || !UUID_RE.test(body.sessionId)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data } = await supabase.from('voice_partner_sessions').select('id, outcome')
    .eq('id', body.sessionId).eq('rep_id', auth.userId).maybeSingle()
  if (!data) return NextResponse.json({ error: 'not_judged' }, { status: 404 })
  return NextResponse.json({ ok: true, outcome: (data as { outcome: string }).outcome })
}
