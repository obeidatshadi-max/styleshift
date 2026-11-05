import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { checkRateLimit } from '@/lib/rate-limit'
import { generatePin } from '@/lib/rep-pin'
import { listReps, resetPin } from '@/lib/rep-pin-service'

async function context() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  // Same gate as the manager dashboard: null unless this user manages a company.
  const stats = await getTeamStatsForUser(user.id)
  if (!stats) return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user, stats, db: createAdminClient() }
}

/** The manager's reps and how each one signs in. */
export async function GET() {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const r = await listReps(ctx.db!, ctx.stats!)
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}

/** Gives one rep a new random PIN and returns it once. */
export async function POST(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  if (!(await checkRateLimit('rep-pin-reset', ctx.user!.id, 20, 3600)))
    return NextResponse.json({ error: 'Too many resets. Try again later.' }, { status: 429 })
  const body = await req.json().catch(() => null) as { repId?: unknown } | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const pin = generatePin(n => crypto.getRandomValues(new Uint8Array(n)))
  const r = await resetPin(ctx.db!, ctx.user!.id, ctx.stats!, body.repId, pin)
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}
