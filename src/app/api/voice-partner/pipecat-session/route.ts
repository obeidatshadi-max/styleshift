import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { signBotToken } from '@/lib/voice-partner-bot-token'
import { isObjectionType, isPhysicianState, isDifficulty } from '@/lib/voice-partner-core'

export async function POST(req: Request) {
  const pipecatKey = process.env.PIPECAT_CLOUD_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !pipecatKey || !process.env.VOICE_PARTNER_BOT_TOKEN_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/session-result — one Pipecat Cloud
  // session-start is itself a billable event, same reasoning as the
  // existing routes' shared limiter.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as {
    doctorId?: string; sessionId?: string; lang?: 'en' | 'ar'
    openingText?: string; objectionType?: string
    state?: unknown; difficulty?: string
  } | null

  if (!body?.doctorId || !body.sessionId || !body.openingText)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isObjectionType(body.objectionType))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!isPhysicianState(body.state))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.difficulty !== undefined && !isDifficulty(body.difficulty))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const lang = body.lang === 'ar' ? 'ar' : 'en'
  const botToken = signBotToken({ userId: user.id, doctorId: body.doctorId, sessionId: body.sessionId })
  const agentName = process.env.PIPECAT_AGENT_NAME || 'styleshift-voice-partner'
  const turnCallbackBaseUrl = new URL(req.url).origin

  let res: Response
  try {
    res = await fetch(`https://api.pipecat.daily.co/v1/public/${agentName}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${pipecatKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        createDailyRoom: true,
        body: {
          botToken, sessionId: body.sessionId, doctorId: body.doctorId, lang,
          openingText: body.openingText, objectionType: body.objectionType,
          state: body.state, turnCallbackBaseUrl,
        },
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

  const data = await res.json().catch(() => null) as { dailyRoom?: string; dailyToken?: string } | null
  if (!data?.dailyRoom || !data.dailyToken) return NextResponse.json({ error: 'invalid' }, { status: 502 })

  return NextResponse.json({ roomUrl: data.dailyRoom, roomToken: data.dailyToken })
}
