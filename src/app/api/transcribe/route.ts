import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

// The client caps recordings at 3 minutes (~3 MB); this bounds what a scripted caller can push to Whisper.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024
// Each debrief is up to 4 clips, so this allows well over a dozen debriefs an hour.
const RATE_LIMIT = 60
const RATE_WINDOW_SEC = 3600

export async function POST(req: Request) {
  // Feature flag: mirrors AI_DRILLS_ENABLED — off by default until both a
  // flag and a key are set, so voice notes ship as a "coming soon" mic
  // button rather than a broken one.
  const apiKey = process.env.OPENAI_API_KEY
  if (process.env.TRANSCRIPTION_ENABLED !== 'true' || !apiKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await checkRateLimit('transcribe', user.id, RATE_LIMIT, RATE_WINDOW_SEC))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })

  const form = await req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!audio || !(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 })
  // Pinning the language stops Whisper mis-detecting short Arabic clips; unknown values fall back to auto-detect.
  const lang = form?.get('lang')

  const upstreamForm = new FormData()
  upstreamForm.append('file', audio, 'note.webm')
  upstreamForm.append('model', 'whisper-1')
  if (lang === 'ar' || lang === 'en') upstreamForm.append('language', lang)

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }

  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })
  const data = await res.json().catch(() => null) as { text?: string } | null
  if (!data?.text) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ text: data.text.trim() })
}
