import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { addFieldCheck } from '@/lib/improvement/server'
import { parseFieldCheckRequest } from '@/lib/improvement/permissions'

/**
 * Field evidence for a follow-up. kind "self_reported" = the rep says it happened in a real visit;
 * kind "verified" = a manager of the same company saw it. The server decides who may write which.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit('improvement-write', user.id, 60, 3600))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const req = parseFieldCheckRequest(await request.json().catch(() => null))
  if (!req) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const result = await addFieldCheck(user.id, req)
  if (result === 'ok') return NextResponse.json({ ok: true })
  return NextResponse.json({ error: result }, { status: result === 'forbidden' ? 403 : result === 'not_found' ? 404 : 500 })
}
