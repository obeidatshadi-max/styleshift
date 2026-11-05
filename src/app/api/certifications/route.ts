import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { certificationEnabled } from '@/lib/certification'
import { issue, overview, revoke } from '@/lib/certification-service'

async function context() {
  if (!certificationEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  // Same gate as the manager dashboard: null unless this user manages a company.
  const stats = await getTeamStatsForUser(user.id)
  if (!stats) return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user, stats, db: createAdminClient() }
}

export async function GET() {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const r = await overview(ctx.db!, ctx.stats!)
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const r = await issue(ctx.db!, ctx.user!.id, ctx.stats!, body)
  return NextResponse.json(r.body, { status: r.status })
}

export async function PATCH(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const r = await revoke(ctx.db!, ctx.user!.id, ctx.stats!, body)
  return NextResponse.json(r.body, { status: r.status })
}
