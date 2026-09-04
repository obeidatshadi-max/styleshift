import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const VOICE = 'onyx'

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !apiKey || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { text?: string }
  if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOICE, input: body.text }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const buf = await res.arrayBuffer()
  const audio = Buffer.from(buf).toString('base64')
  return NextResponse.json({ audio })
}
