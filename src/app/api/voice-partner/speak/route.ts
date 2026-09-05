import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

// One fixed voice for both languages — the language is steered through the
// per-request `instructions` field rather than by swapping voice names.
const VOICE = 'onyx'
// Matches turn/route.ts's MAX_TURN_CHARS — a doctor line never legitimately
// runs this long, so anything longer is misuse, not a real conversation.
const MAX_TEXT_CHARS = 2000

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !apiKey || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn (see open/route.ts).
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => ({})) as { text?: string; lang?: 'en' | 'ar' }
  if (!body.text || typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const lang = body.lang === 'ar' ? 'ar' : 'en'
  const instructions = lang === 'ar'
    ? 'Speak in clear, natural Modern Standard Arabic.'
    : 'Speak in clear, natural English.'

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOICE, input: body.text, instructions }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const buf = await res.arrayBuffer()
  const audio = Buffer.from(buf).toString('base64')
  return NextResponse.json({ audio })
}
