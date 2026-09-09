import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyName } = await request.json()
  if (!companyName?.trim()) return NextResponse.json({ error: 'Company name required' }, { status: 400 })

  const admin = createAdminClient()

  // A manager who already has a team and revisits /onboarding (bookmark,
  // back button, lost session) must not silently spawn a second company and
  // get their profile repointed away from the real one — return their
  // existing team instead of creating a duplicate.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (existingProfile?.company_id && existingProfile.role === 'manager') {
    const { data: existingCompany, error: existingError } = await admin
      .from('companies')
      .select()
      .eq('id', existingProfile.company_id)
      .single()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    return NextResponse.json({ company: existingCompany })
  }

  const { data: company, error: companyError } = await admin
    .from('companies')
    .insert({ name: companyName.trim(), plan: 'free' })
    .select()
    .single()

  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 })

  const { error: profileError } = await admin
    .from('profiles')
    .update({ company_id: company.id, role: 'manager', display_name: user.email?.split('@')[0] })
    .eq('id', user.id)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ company })
}
