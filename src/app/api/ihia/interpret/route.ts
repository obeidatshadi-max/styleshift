import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { interpret, REGIONS, type Region } from '@/lib/ihia/core'
import { approvedKnowledge, ihiaEnabled } from '@/lib/ihia/server'

export async function POST(req: Request) {
  if (!ihiaEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit('ihia', user.id, 60, 3600))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000
    || (body.region !== undefined && !REGIONS.includes(body.region))) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  try {
    return NextResponse.json(interpret(body.text, await approvedKnowledge(db), (body.region ?? 'baghdad') as Region),
      { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'knowledge_unavailable' }, { status: 503 }) }
}
