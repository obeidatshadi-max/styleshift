import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseShareRequest, SHARE_TABLE } from '@/lib/manager-share'

/** Current sharing state of one of the rep's own items (so a reopened report shows the right checkbox). */
export async function GET(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = new URL(req.url).searchParams
  const request = parseShareRequest({ kind: params.get('kind'), id: params.get('id'), shared: false })
  if (!request) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const { data, error } = await createAdminClient().from(SHARE_TABLE[request.kind])
    .select('shared_with_manager_at').eq('id', request.id).eq('rep_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'share_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ sharedAt: (data as { shared_with_manager_at: string | null }).shared_with_manager_at })
}

/** A rep shares (or stops sharing) one of their own debriefs or text simulations with their manager. */
export async function POST(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const request = parseShareRequest(await req.json().catch(() => null))
  if (!request) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  if (!(await checkRateLimit('share-with-manager', user.id, 120, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })

  const sharedAt = request.shared ? new Date().toISOString() : null
  // Ownership is part of the WHERE clause: a rep can only ever flag their own rows.
  const { data, error } = await createAdminClient().from(SHARE_TABLE[request.kind])
    .update({ shared_with_manager_at: sharedAt })
    .eq('id', request.id).eq('rep_id', user.id).select('id')
  if (error) return NextResponse.json({ error: 'share_failed' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, sharedAt })
}
