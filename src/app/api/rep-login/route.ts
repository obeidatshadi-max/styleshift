import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const { mobile } = await request.json()
  if (!mobile?.trim())
    return NextResponse.json({ error: 'Mobile number required' }, { status: 400 })

  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
  const email = `${normalizedMobile}@s.styleshift.rep`

  const admin = createAdminClient()

  // generateLink returns error if user doesn't exist — safe gate against unknowns
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData)
    return NextResponse.json(
      { error: 'Mobile number not found. Use the invite link from your manager.' },
      { status: 404 }
    )

  // Verify this is an actual rep with a company (not a ghost account)
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', linkData.user.id)
    .single()

  if (!profile?.company_id || profile.role !== 'rep')
    return NextResponse.json(
      { error: 'Mobile number not found. Use the invite link from your manager.' },
      { status: 404 }
    )

  return NextResponse.json({ token_hash: linkData.properties.hashed_token })
}
