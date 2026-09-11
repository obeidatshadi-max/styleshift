import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

const PIN_RE = /^\d{6}$/

export async function POST(request: Request) {
  if (!(await checkRateLimit('rep-join', clientIp(request), 10, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { name, mobile, pin, inviteCode } = await request.json()
  if (!name?.trim() || !mobile?.trim() || !inviteCode?.trim())
    return NextResponse.json({ error: 'Name and mobile number required' }, { status: 400 })
  if (!PIN_RE.test(pin ?? ''))
    return NextResponse.json({ error: 'Choose a 6-digit PIN' }, { status: 400 })

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

  // The PIN the rep just chose becomes their Supabase password — reuses
  // GoTrue's own hashing/verification instead of us rolling our own, and
  // gives every returning login a real secret to prove instead of just a
  // mobile number anyone could type in.
  let userId: string | undefined
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { display_name: name.trim() },
  })
  if (!createError && created?.user) {
    userId = created.user.id
  } else {
    // Re-join via the same invite link (new device, reinstalled app, etc.) —
    // resolve the existing user id via generateLink purely as a lookup (the
    // link itself is discarded, never used to authenticate), then reset
    // their PIN to the one just entered.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError || !linkData)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    userId = linkData.user.id
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password: pin })
    if (pwError)
      return NextResponse.json({ error: 'Failed to set PIN' }, { status: 500 })
  }

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

  // Sign in server-side so the response carries the session cookie directly —
  // the client never sees a token it could reuse or leak.
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pin })
  if (signInError)
    return NextResponse.json({ error: 'Account created, but sign-in failed. Try logging in.' }, { status: 500 })

  return NextResponse.json({ company_name: company.name })
}
