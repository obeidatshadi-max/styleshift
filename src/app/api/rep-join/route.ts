import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { toE164Iraq } from '@/lib/phone'

export async function POST(request: Request) {
  if (!(await checkRateLimit('rep-join', clientIp(request), 10, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { name, mobile, inviteCode } = await request.json()
  if (!name?.trim() || !mobile?.trim() || !inviteCode?.trim())
    return NextResponse.json({ error: 'Name and mobile number required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id, name, plan')
    .eq('invite_code', inviteCode)
    .single()
  if (companyError || !company)
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })

  if (company.plan === 'free') {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('role', 'rep')
    if ((count ?? 0) >= 10)
      return NextResponse.json({ error: 'Team is full. Ask your manager to upgrade.' }, { status: 403 })
  }

  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
  const email = `${normalizedMobile}@s.styleshift.rep`

  // Same validation /api/rep-login uses for SMS OTP — reject numbers here that
  // would otherwise register fine but can never complete a later phone login.
  const e164 = toE164Iraq(mobile)
  if (!e164)
    return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400 })

  // Try to create new user (auto-confirmed, internal email domain — no real email sent)
  let userId: string | undefined
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: name.trim() },
  })
  if (!createError && created?.user) {
    userId = created.user.id
  }

  // Generate magic link (works for new or existing user; does not send real email)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData)
    return NextResponse.json({ error: 'Failed to create login token' }, { status: 500 })

  userId ??= linkData.user.id

  // Set the real phone on this auth user so a later login can use SMS OTP
  // instead of the mobile-number-only magiclink this join step still uses.
  // Marking it confirmed here is safe: identity is already gated by the
  // invite code above, the same trust boundary email_confirm relies on.
  await admin.auth.admin.updateUserById(userId, { phone: e164, phone_confirm: true })

  // Assign to company (upsert handles both first-join and re-join)
  await admin
    .from('profiles')
    .upsert(
      { id: userId, company_id: company.id, role: 'rep', display_name: name.trim() },
      { onConflict: 'id' }
    )

  // Funnel event — best-effort (insert() resolves with an error object rather
  // than rejecting, so this can't throw and never blocks the rep's join).
  await admin.from('invite_events').insert({ company_id: company.id, rep_id: userId, stage: 'signup_completed' })

  return NextResponse.json({
    token_hash: linkData.properties.hashed_token,
    company_name: company.name,
  })
}
