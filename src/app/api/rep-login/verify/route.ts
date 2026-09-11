import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { toE164Iraq } from '@/lib/phone'

/**
 * Step 2 of rep login: verify the SMS code sent by POST /api/rep-login.
 * On success, Supabase's SSR client writes the session cookies onto this
 * response directly — the caller just needs to reload, not handle tokens.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  // Tight limit: this is the brute-force surface for a 6-digit code.
  if (!(await checkRateLimit('rep-login-verify', ip, 10, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { mobile, code } = await request.json()
  if (!mobile?.trim() || !code?.trim())
    return NextResponse.json({ error: 'Enter the code sent to your phone' }, { status: 400 })

  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
  if (!(await checkRateLimit('rep-login-verify', normalizedMobile, 6, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const e164 = toE164Iraq(mobile)
  if (!e164)
    return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: code.trim(),
    type: 'sms',
  })
  if (error)
    return NextResponse.json({ error: 'Incorrect or expired code' }, { status: 400 })

  return NextResponse.json({ ok: true })
}
