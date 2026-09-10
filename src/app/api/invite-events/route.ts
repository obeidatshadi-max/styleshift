import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Records invite-funnel events. 'link_opened' is public by necessity — it
 * fires from an unauthenticated visitor on /invite/[code], before any
 * session exists — so it's IP rate-limited and resolves the code
 * server-side rather than trusting a caller-supplied company id.
 * 'first_drill_completed' requires an authenticated rep and is deduped
 * server-side (insert only if no such row already exists for them), since
 * "first" must hold even if the client retries or fires twice. The third
 * stage, 'signup_completed', is logged inline in /api/rep-join instead —
 * that route already has both the rep id and company id on hand.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const admin = createAdminClient()

  if (body?.stage === 'link_opened') {
    if (!(await checkRateLimit('invite-events', clientIp(request), 20, 600)))
      return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })
    if (!body?.inviteCode?.trim()) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })

    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('invite_code', body.inviteCode.trim())
      .single()
    if (company) await admin.from('invite_events').insert({ company_id: company.id, stage: 'link_opened' })
    return NextResponse.json({ ok: true }) // unknown code — drop silently either way, not the visitor's problem
  }

  if (body?.stage === 'first_drill_completed') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return NextResponse.json({ ok: true }) // solo account, no team to attribute the funnel to

    const { data: existing } = await admin
      .from('invite_events')
      .select('id')
      .eq('rep_id', user.id)
      .eq('stage', 'first_drill_completed')
      .maybeSingle()
    if (!existing) {
      await admin.from('invite_events').insert({ company_id: profile.company_id, rep_id: user.id, stage: 'first_drill_completed' })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
}
