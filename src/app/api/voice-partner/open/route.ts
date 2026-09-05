import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, buildOpeningPrompt, parseOpeningResponse } from '@/lib/voice-partner-core'
import type { Doctor, DoctorVisit } from '@/types/game'

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { doctorId?: string; lang?: 'en' | 'ar' }
  if (!body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const lang = body.lang === 'ar' ? 'ar' : 'en'

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', body.doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildOpeningPrompt(doctor as Doctor, style, lang, historyContext) }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const doctorText = parseOpeningResponse(data?.content?.[0]?.text ?? '')
  if (!doctorText) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ doctorText })
}
