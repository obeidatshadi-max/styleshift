import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { ihiaEnabled, isReviewer } from '@/lib/ihia/server'

async function context() {
  if (!ihiaEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!(await isReviewer(db, user.id))) return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { db, user }
}

/** Pending proposals, grouped so the same fix made by several reps shows once with a count. */
export async function GET() {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const { data, error } = await ctx.db!.from('ihia_proposals').select('id, heard, meant, rep_id, created_at')
    .eq('status', 'pending').order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: 'proposals_unavailable' }, { status: 503 })
  const groups = new Map<string, { heard: string; meant: string; ids: string[]; reps: Set<string>; latest: string }>()
  for (const r of (data ?? []) as { id: string; heard: string; meant: string; rep_id: string; created_at: string }[]) {
    const key = `${r.heard.trim()}\u0000${r.meant.trim()}`
    const g = groups.get(key) ?? { heard: r.heard.trim(), meant: r.meant.trim(), ids: [], reps: new Set<string>(), latest: r.created_at }
    g.ids.push(r.id); g.reps.add(r.rep_id)
    groups.set(key, g)
  }
  const proposals = [...groups.values()].map(g => ({ heard: g.heard, meant: g.meant, ids: g.ids, times: g.ids.length, reps: g.reps.size, latest: g.latest }))
    .sort((a, b) => b.times - a.times || b.latest.localeCompare(a.latest))
  return NextResponse.json({ proposals }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Mark a group of proposals as turned into a draft entry, or dismissed. */
export async function PATCH(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const body = await req.json().catch(() => null) as { ids?: unknown; action?: unknown; entryId?: unknown } | null
  const ids = body && Array.isArray(body.ids) ? body.ids : null
  if (!body || !ids || ids.length === 0 || ids.length > 500 || !ids.every(i => typeof i === 'string')
    || (body.action !== 'drafted' && body.action !== 'dismissed')
    || (body.action === 'drafted' && typeof body.entryId !== 'string'))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const { error } = await ctx.db!.from('ihia_proposals').update({
    status: body.action, entry_id: body.action === 'drafted' ? body.entryId : null,
    handled_by: ctx.user!.id, handled_at: new Date().toISOString(),
  }).in('id', ids as string[]).eq('status', 'pending')
  return error ? NextResponse.json({ error: 'save_failed' }, { status: 400 }) : NextResponse.json({ ok: true })
}
