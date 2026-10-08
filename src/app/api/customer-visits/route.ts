// src/app/api/customer-visits/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

const RETENTION_POLICIES = ['discard_after_report', 'retain_90_days', 'retain_indefinite']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('customer-visit-create', user.id, 20, 3600)))
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null) as {
    consent?: boolean; objective?: string; productContext?: string; retentionPolicy?: string
  } | null
  if (!body || body.consent !== true)
    return NextResponse.json({ error: 'Recording and analysis consent must be explicitly confirmed.' }, { status: 400 })

  const retention_policy = RETENTION_POLICIES.includes(body.retentionPolicy ?? '') ? body.retentionPolicy! : 'discard_after_report'

  const { data, error } = await supabase.from('customer_visits').insert({
    rep_id: user.id,
    objective: body.objective ?? null,
    product_context: body.productContext ?? null,
    retention_policy,
    consent_confirmed_at: new Date().toISOString(),
    status: 'recording',
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'Could not start visit recording' }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
