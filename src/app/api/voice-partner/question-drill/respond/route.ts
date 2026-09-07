import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, transcribeAudio } from '@/lib/voice-partner-core'
import { buildListeningJudgePrompt, parseListeningJudgeResponse, isQuestionType } from '@/lib/voice-partner-questioning'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Doctor, DoctorVisit } from '@/types/game'

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !openaiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with the rest of voice partner.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const doctorId = form.get('doctorId')
  const lang = form.get('lang') === 'ar' ? 'ar' : 'en'
  const audio = form.get('audio')
  const questionText = form.get('questionText')
  const doctorAnswer = form.get('doctorAnswer')
  const questionTypeRaw = form.get('questionType')
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof questionText !== 'string' || !questionText.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof doctorAnswer !== 'string' || !doctorAnswer.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (typeof questionTypeRaw !== 'string' || !isQuestionType(questionTypeRaw)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  const repResponseText = await transcribeAudio(audio, openaiKey, lang)
  if (!repResponseText) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const prompt = buildListeningJudgePrompt(doctor as Doctor, style, lang, historyContext, questionText, doctorAnswer, questionTypeRaw, repResponseText)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const judged = parseListeningJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ repResponseText, doctorText: judged.doctorText, listeningCuesHit: judged.listeningCuesHit })
}
