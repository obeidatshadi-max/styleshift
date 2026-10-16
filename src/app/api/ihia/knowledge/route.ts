import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { ihiaEnabled, isReviewer } from '@/lib/ihia/server'
import { validateEntry } from '@/lib/ihia/core'

async function context() {
  if (!ihiaEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!(await isReviewer(db, user.id))) return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { db, user }
}
export async function GET(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const historyId = new URL(req.url).searchParams.get('history')
  if (historyId) {
    const { data, error } = await ctx.db!.from('ihia_history').select('*').eq('entry_id', historyId).order('version', { ascending: false }).limit(100)
    return error ? NextResponse.json({ error: 'knowledge_unavailable' }, { status: 503 })
      : NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  }
  const { data, error } = await ctx.db!.from('ihia_entries').select('*').order('updated_at', { ascending: false }).limit(200)
  return error ? NextResponse.json({ error: 'knowledge_unavailable' }, { status: 503 })
    : NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const entry = validateEntry(await req.json().catch(() => null))
  if (!entry) return NextResponse.json({ error: 'invalid_entry' }, { status: 400 })
  const { data, error } = await ctx.db!.from('ihia_entries').insert({ ...entry, created_by: ctx.user!.id }).select().single()
  return error ? NextResponse.json({ error: 'save_failed' }, { status: 400 }) : NextResponse.json(data, { status: 201 })
}
export async function PATCH(req: Request) {
  const ctx = await context()
  if (ctx.response) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || !Number.isInteger(body.version) || typeof body.review_note !== 'string'
    || !body.review_note.trim() || body.review_note.length > 800) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const entry = body.action === 'correct' ? validateEntry(body.entry) : null
  if ((body.action === 'correct' && !entry) || !['correct', 'approved', 'rejected'].includes(body.action))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const patch = entry ? { ...entry, status: 'draft', review_note: body.review_note }
    : { status: body.action, review_note: body.review_note }
  const { data, error } = await ctx.db!.from('ihia_entries').update(patch).eq('id', body.id).eq('version', body.version).select().maybeSingle()
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 400 })
  return data ? NextResponse.json(data) : NextResponse.json({ error: 'conflict_reload' }, { status: 409 })
}
