import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(request: Request) {
  if (!(await checkRateLimit('manager-signup', clientIp(request), 5, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { email, password } = await request.json()
  if (!email?.trim() || !password)
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  if (password.length < 6)
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })

  const admin = createAdminClient()

  // Create an already-confirmed manager account server-side. Unlike the client
  // auth.signUp flow this sends NO confirmation email, so it never touches
  // Supabase's tiny built-in email quota (the 2/hr cap that locked everyone out).
  // The client then signs in with the password — no SMTP anywhere in the path.
  const { error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  })

  if (error) {
    const already = /already|registered|exists/i.test(error.message)
    return NextResponse.json(
      { error: already ? 'An account with this email already exists. Please sign in.' : error.message },
      { status: already ? 409 : 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
