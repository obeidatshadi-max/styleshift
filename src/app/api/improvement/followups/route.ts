import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { acknowledgeFollowup, closeFollowup, createFollowup } from '@/lib/improvement/server'
import { parseFollowupRequest } from '@/lib/improvement/permissions'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Manager assigns a roadmap focus to one rep of their own company. */
export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit('improvement-write', user.id, 60, 3600))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const req = parseFollowupRequest(await request.json().catch(() => null))
  if (!req) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const result = await createFollowup(user.id, req)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'forbidden' ? 403 : 500 })
  return NextResponse.json({ id: result.id, existing: result.existing })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Rep acknowledges, or manager closes, one follow-up. */
export async function PATCH(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit('improvement-write', user.id, 60, 3600))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id) || (body.action !== 'acknowledge' && body.action !== 'close'))
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const result = body.action === 'acknowledge' ? await acknowledgeFollowup(user.id, body.id) : await closeFollowup(user.id, body.id)
  if (result === 'ok') return NextResponse.json({ ok: true })
  return NextResponse.json({ error: result }, { status: result === 'forbidden' ? 403 : result === 'not_found' ? 404 : 500 })
}
