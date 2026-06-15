import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: Request) {
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
    if ((count ?? 0) >= 3)
      return NextResponse.json({ error: 'Team is full. Ask your manager to upgrade.' }, { status: 403 })
  }

  const normalizedMobile = mobile.replace(/[\s\-\(\)+]/g, '')
  const email = `${normalizedMobile}@s.styleshift.rep`

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

  // Assign to company (upsert handles both first-join and re-join)
  await admin
    .from('profiles')
    .upsert(
      { id: userId, company_id: company.id, role: 'rep', display_name: name.trim() },
      { onConflict: 'id' }
    )

  return NextResponse.json({
    token_hash: linkData.properties.hashed_token,
    company_name: company.name,
  })
}
