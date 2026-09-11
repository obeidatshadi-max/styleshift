import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Rep login: mobile number + PIN. The PIN was set at rep-join and lives in
 * Supabase as the account's password, so this is a normal password sign-in
 * under the hood — GoTrue verifies it, we never see or store it ourselves.
 *
 * Previously this endpoint returned a magiclink token_hash from the mobile
 * number alone, with no proof the caller held anything private — anyone who
 * knew a rep's number could sign in as them. Requiring the PIN closes that.
 *
 * One generic error for "unknown number" and "wrong PIN" — deliberately not
 * distinguishable, so this can't be used to enumerate which numbers are
 * registered reps.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!(await checkRateLimit('rep-login', ip, 15, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { mobile, pin } = await request.json()
  if (!mobile?.trim() || !pin?.trim())
    return NextResponse.json({ error: 'Mobile number and PIN required' }, { status: 400 })

  // Also throttle per-number, not just per-IP — otherwise a botnet can still
  // brute-force one victim's PIN by spreading attempts across many source IPs.
  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
  if (!(await checkRateLimit('rep-login', normalizedMobile, 8, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const email = `${normalizedMobile}@s.styleshift.rep`
  const invalidCreds = () =>
    NextResponse.json({ error: 'Incorrect mobile number or PIN.' }, { status: 401 })

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: pin })
  if (error) return invalidCreds()

  return NextResponse.json({ ok: true })
}
