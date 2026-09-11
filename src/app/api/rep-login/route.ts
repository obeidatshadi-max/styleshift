import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { toE164Iraq } from '@/lib/phone'

/**
 * Step 1 of rep login: verify the mobile number belongs to a provisioned rep,
 * then send a real SMS OTP to that number (via Supabase Phone Auth / Twilio).
 *
 * Previously this endpoint returned a magiclink token_hash straight to the
 * caller, so anyone who knew a rep's mobile number could sign in as them —
 * no proof they actually held the phone. It now never returns anything the
 * caller could use to authenticate directly; the OTP code, sent out-of-band
 * to the phone, is verified separately by /api/rep-login/verify.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!(await checkRateLimit('rep-login', ip, 15, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { mobile } = await request.json()
  if (!mobile?.trim())
    return NextResponse.json({ error: 'Mobile number required' }, { status: 400 })

  // Also throttle per-number, not just per-IP — otherwise a botnet can still
  // SMS-bomb one victim's phone from many source IPs.
  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
  if (!(await checkRateLimit('rep-login', normalizedMobile, 8, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const e164 = toE164Iraq(mobile)
  if (!e164)
    return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400 })

  const email = `${normalizedMobile}@s.styleshift.rep`
  const admin = createAdminClient()

  const notFound = () =>
    NextResponse.json(
      { error: 'Mobile number not found. Use the invite link from your manager.' },
      { status: 404 }
    )

  // NOTE: generateLink CREATES the auth user when the email is unknown (it does
  // NOT error on unknowns). So it can't be the existence gate — using it that way
  // leaks an orphan <mobile>@s.styleshift.rep user for every unknown number tried.
  // We still use it here purely as an existence probe; the token it returns is
  // discarded (never sent to the client — that was the vulnerability).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData) return notFound()

  // Real reps always have a profile (created at rep-join) with a company + rep role.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', linkData.user.id)
    .maybeSingle()

  // On a DB error we can't distinguish orphan from real — fail safe, never delete.
  if (profileError)
    return NextResponse.json(
      { error: 'Login temporarily unavailable. Please try again.' },
      { status: 503 }
    )

  // No profile row at all → generateLink just created an orphan. Remove it so
  // unknown numbers don't accumulate ghost accounts, then report not-found.
  if (!profile) {
    await admin.auth.admin.deleteUser(linkData.user.id)
    return notFound()
  }

  // A profile exists but isn't a provisioned rep — don't delete a real row, just gate.
  if (!profile.company_id || profile.role !== 'rep') return notFound()

  // Backfill the phone field for reps created before this fix (rep-join now
  // sets it at signup time). Safe: identity was already established above via
  // the same normalized mobile number that derives the internal lookup email.
  const { error: phoneUpdateError } = await admin.auth.admin.updateUserById(linkData.user.id, {
    phone: e164,
    phone_confirm: true,
  })
  if (phoneUpdateError)
    return NextResponse.json(
      { error: 'Login temporarily unavailable. Please try again.' },
      { status: 503 }
    )

  // Send the real OTP. shouldCreateUser: false is load-bearing — this must
  // never create a new auth user from an arbitrary phone number, only text a
  // code to a rep we've already verified exists above.
  const supabase = await createClient()
  const { error: otpError } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: { shouldCreateUser: false },
  })
  if (otpError)
    return NextResponse.json({ error: 'Could not send login code. Try again.' }, { status: 503 })

  return NextResponse.json({ ok: true })
}
