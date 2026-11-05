import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { isMobileRepEmail } from '@/lib/rep-pin'

export async function POST(request: Request) {
  if (!(await checkRateLimit('rep-signup', clientIp(request), 5, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { email, password, name } = await request.json()
  if (!email?.trim() || !password)
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  // That domain is the hidden login of PIN reps; letting anyone register an address on it would let
  // them claim a colleague's mobile number in advance.
  if (isMobileRepEmail(email.trim()))
    return NextResponse.json({ error: 'Please use a different email address.' }, { status: 400 })
  if (password.length < 6)
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })

  const admin = createAdminClient()

  // Same pattern as manager-signup: create an already-confirmed account
  // server-side so no confirmation email touches Supabase's tiny built-in
  // quota, then the client signs in with the password. profiles.role
  // defaults to 'rep' and company_id stays null — this is a solo individual
  // account, not attached to any manager's team (unlike the invite-link
  // path in /api/rep-join, which sets company_id + role from the invite code).
  const { data: created, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: name?.trim() ? { display_name: name.trim() } : undefined,
  })

  if (error) {
    const already = /already|registered|exists/i.test(error.message)
    return NextResponse.json(
      { error: already ? 'An account with this email already exists. Please sign in.' : error.message },
      { status: already ? 409 : 400 }
    )
  }

  // No DB trigger creates the profiles row — insert it explicitly (role
  // defaults to 'rep', company_id stays null: a solo account, unlike the
  // invite-link path in /api/rep-join which sets company_id from the code).
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: created.user.id, display_name: name?.trim() || undefined })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: 'Failed to create profile. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
