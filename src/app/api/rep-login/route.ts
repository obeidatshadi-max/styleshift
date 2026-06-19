import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const { mobile } = await request.json()
  if (!mobile?.trim())
    return NextResponse.json({ error: 'Mobile number required' }, { status: 400 })

  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
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

  return NextResponse.json({ token_hash: linkData.properties.hashed_token })
}
