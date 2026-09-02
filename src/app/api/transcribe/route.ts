import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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

  const form = await req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!audio || !(audio instanceof Blob)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const upstreamForm = new FormData()
  upstreamForm.append('file', audio, 'note.webm')
  upstreamForm.append('model', 'whisper-1')

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
