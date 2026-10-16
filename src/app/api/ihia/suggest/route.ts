import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { suggestionCompletion } from '@/lib/ihia/provider'
import { REGIONS, type Region } from '@/lib/ihia/core'
import { ihiaEnabled } from '@/lib/ihia/server'
import { DEFAULT_SITUATION, suggestExpressions } from '@/lib/ihia/suggestions'

export const maxDuration = 60
export async function POST(req: Request) {
  if (!ihiaEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || (body.situation !== undefined && (typeof body.situation !== 'string' || body.situation.length > 1000))
    || (body.region !== undefined && !REGIONS.includes(body.region)))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!(await checkRateLimit('ihia-suggest', user.id, 10, 3600)))
    return NextResponse.json({ error: 'Too many suggestion requests. Please try again later.' }, { status: 429 })
  // Reuse existing server credentials; Gemini remains the separate live voice provider.
  const complete = suggestionCompletion()
  if (!complete) return NextResponse.json({ error: 'AI suggestions are not configured.' }, { status: 503 })
  try {
    const suggestions = await suggestExpressions(complete, body.situation?.trim() || DEFAULT_SITUATION,
      (body.region ?? 'baghdad') as Region)
    if (!suggestions) return NextResponse.json({ error: 'The AI could not produce valid suggestions. Please try again.' }, { status: 502 })
    return NextResponse.json({ suggestions, status: 'unverified',
      notice: 'AI suggestions may be wrong. Confirm wording and meaning with an Iraqi speaker before approving.' },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'AI suggestions are temporarily unavailable.' }, { status: 502 }) }
}
