import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { Doctor } from '@/types/game'

const AGENT_NAME = process.env.PIPECAT_AGENT_NAME ?? 'styleshift-voice-partner'

export async function POST(req: Request) {
  const publicKey = process.env.PIPECAT_CLOUD_PUBLIC_KEY
  if (process.env.AI_VOICE_PARTNER_LIVE_ENABLED !== 'true' || !publicKey) {
    return NextResponse.json({ error: 'pipecat_not_configured' }, { status: 503 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { doctorId?: string; lang?: 'ar' | 'en'; difficulty?: 'supportive' | 'realistic' | 'challenging'; provider?: 'gemini' | 'openai' }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  if (body.provider !== undefined && body.provider !== 'gemini' && body.provider !== 'openai') return NextResponse.json({ error: 'invalid_provider' }, { status: 400 })
  if (body.difficulty !== undefined && !['supportive', 'realistic', 'challenging'].includes(body.difficulty)) return NextResponse.json({ error: 'invalid_difficulty' }, { status: 400 })
  if (body.lang !== undefined && body.lang !== 'ar' && body.lang !== 'en') return NextResponse.json({ error: 'invalid_language' }, { status: 400 })
  if (typeof body.doctorId !== 'string' || !body.doctorId) return NextResponse.json({ error: 'doctor_required' }, { status: 400 })
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).eq('rep_id', user.id).single()
  if (!doctor) return NextResponse.json({ error: 'doctor_not_found' }, { status: 404 })
  const d = doctor as Doctor
  const sessionBody = { ...(body.provider ? { provider: body.provider } : {}), lang: body.lang === 'en' ? 'en' : 'ar', difficulty: body.difficulty ?? 'realistic', doctor: {
    name: d.name, specialty: d.specialty, style: d.style ?? 'analytical', key_phrases: d.key_phrases,
    objections: d.objections, objection_notes: d.objection_notes, hidden_concern: d.hidden_concern,
    product_context: d.product_context, meeting_stage: d.meeting_stage,
  }}
  const url = 'https://api.pipecat.daily.co/v1/public/' + encodeURIComponent(AGENT_NAME) + '/start'
  const res = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + publicKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000), body: JSON.stringify({ transport: 'daily', createDailyRoom: true, body: sessionBody }) }).catch(() => null)
  if (!res) return NextResponse.json({ error: 'pipecat_unreachable' }, { status: 502 })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json({ error: 'pipecat_start_failed' }, { status: 502 })
  return NextResponse.json({ ...data, agentName: AGENT_NAME })
}
