import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildHistoryContext } from '@/lib/doctor-context'
import { SYSTEM, TURN_CAP, buildJudgePrompt, parseJudgeResponse, resolveTurn, type VoicePartnerTurn } from '@/lib/voice-partner-core'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Doctor, DoctorVisit } from '@/types/game'

// A full conversation is at most TURN_CAP rep lines plus TURN_CAP doctor lines.
const MAX_HISTORY_ENTRIES = 2 * TURN_CAP
const MAX_TURN_CHARS = 2000

/** Validates the client-supplied conversation history. Returns null (→ 400) for
 * anything that isn't a bounded array of well-formed {role, text} turns. */
function parseHistory(raw: FormDataEntryValue | null): VoicePartnerTurn[] | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!Array.isArray(parsed) || parsed.length > MAX_HISTORY_ENTRIES) return null
  const turns: VoicePartnerTurn[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return null
    const { role, text } = entry as Record<string, unknown>
    if (role !== 'doctor' && role !== 'rep') return null
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TURN_CHARS) return null
    turns.push({ role, text })
  }
  return turns
}

async function transcribe(audio: Blob, apiKey: string, lang: 'en' | 'ar'): Promise<string | null> {
  const form = new FormData()
  form.append('file', audio, 'turn.webm')
  form.append('model', 'whisper-1')
  // Pinning the language stops Whisper guessing (and mis-transcribing short
  // Arabic replies as another language) when the session is already known.
  form.append('language', lang === 'ar' ? 'ar' : 'en')
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch { return null }
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { text?: string } | null
  return data?.text?.trim() || null
}

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey || !openaiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/speak (see open/route.ts).
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const doctorId = form.get('doctorId')
  const lang = form.get('lang') === 'ar' ? 'ar' : 'en'
  const historyRaw = form.get('history')
  const audio = form.get('audio')
  if (typeof doctorId !== 'string' || !doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // The client resends the whole conversation each turn, so `history` is
  // untrusted input that gets interpolated verbatim into the guardrailed judge
  // prompt as Doctor:/Rep: lines. Fail loudly on anything malformed rather than
  // silently falling back to [] — a well-behaved client never sends bad shapes,
  // and an empty fallback would mask the bug while resetting the turn count.
  const history = parseHistory(historyRaw)
  if (!history) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const { data: visits } = await supabase
    .from('doctor_visits').select('*').eq('doctor_id', doctorId)
    .order('created_at', { ascending: false }).limit(5)
  const historyContext = buildHistoryContext((visits as DoctorVisit[]) ?? [])

  const repText = await transcribe(audio, openaiKey, lang)
  if (!repText) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const turnCount = history.filter(h => h.role === 'rep').length + 1
  const prompt = buildJudgePrompt(doctor as Doctor, style, lang, historyContext, history, repText, turnCount)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const judged = parseJudgeResponse(data?.content?.[0]?.text ?? '')
  if (!judged) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  const outcome = resolveTurn(turnCount, judged.verdict)

  return NextResponse.json({ repText, doctorText: judged.doctorReply, outcome, turnCount })
}
