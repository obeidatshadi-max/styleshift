import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { isAllowedPushEndpoint, parseSubscribeBody } from '@/lib/push-core'

export async function POST(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit('push-subscribe', user.id, 20, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  const sub = parseSubscribeBody(await req.json().catch(() => null))
  if (!sub) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  // Same device re-subscribing keeps its history; a new device starts fresh.
  const { error } = await db.from('push_subscriptions').upsert({ rep_id: user.id, ...sub }, { onConflict: 'endpoint' })
  return error ? NextResponse.json({ error: 'save_failed' }, { status: 500 }) : NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const endpoint = new URL(req.url).searchParams.get('endpoint')
  if (!isAllowedPushEndpoint(endpoint)) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('rep_id', user.id)
  return error ? NextResponse.json({ error: 'delete_failed' }, { status: 500 }) : NextResponse.json({ ok: true })
}
