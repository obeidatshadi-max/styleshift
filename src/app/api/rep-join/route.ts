import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

const PIN_RE = /^\d{6}$/
const MOBILE_RE = /^\d{8,15}$/

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
  // The number becomes part of a hidden login email, so it has to be digits only.
  if (!MOBILE_RE.test(normalizedMobile))
    return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400 })
  // One number, not just one IP: otherwise a botnet can probe which numbers already have an account.
  if (!(await checkRateLimit('rep-join-number', normalizedMobile, 5, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })
  const email = `${normalizedMobile}@s.styleshift.rep`
  const blocked = () => NextResponse.json({ error: 'We could not complete the join. If you already have an account, sign in with your PIN or ask your manager to reset it.' }, { status: 409 })

  // The PIN the rep just chose becomes their Supabase password — reuses
  // GoTrue's own hashing/verification instead of us rolling our own, and
  // gives every returning login a real secret to prove instead of just a
  // mobile number anyone could type in.
  let userId: string
  let leftover = false
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { display_name: name.trim() },
  })
  if (!createError && created?.user) {
    userId = created.user.id
  } else if (createError && /already|registered|exists/i.test(createError.message)) {
    // The number already has a login. This used to reset its PIN to whatever was typed here and move
    // the person into this company, so anyone holding an invite link and a colleague's number could
    // take the account over. Now an existing rep is told to sign in, or to ask their manager for a
    // new PIN (the manager's Reset PIN). Only a leftover login with no profile (a join that failed
    // half way) is finished off here, because there is nobody to lock out.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkError || !linkData)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    const { data: existing, error: lookupError } = await admin.from('profiles').select('id').eq('id', linkData.user.id).maybeSingle()
    // If we cannot tell whether someone owns this login, change nothing.
    if (lookupError)
      return NextResponse.json({ error: 'Could not complete the join. Try again.' }, { status: 503 })
    if (existing) return blocked()
    userId = linkData.user.id
    leftover = true
  } else {
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  // Claim the profile with an insert that can never overwrite or move an existing one. Two joins racing
  // for the same leftover login cannot both win: the loser's insert conflicts, and it never reaches the
  // password change below.
  const { error: claimError } = await admin
    .from('profiles')
    .insert({ id: userId, company_id: company.id, role: 'rep', display_name: name.trim() })
  if (claimError) {
    if (!leftover) await admin.auth.admin.deleteUser(userId)
    if (leftover && claimError.code === '23505') return blocked()
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  if (leftover) {
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password: pin })
    if (pwError) {
      await admin.from('profiles').delete().eq('id', userId)
      return NextResponse.json({ error: 'Failed to set PIN' }, { status: 500 })
    }
  }

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
