import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: 'Invite code required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id, name, plan')
    .eq('invite_code', code)
    .single()

  if (companyError || !company) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })

  // Enforce Free plan rep limit (max 10)
  if (company.plan === 'free') {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('role', 'rep')
    if ((count ?? 0) >= 10) return NextResponse.json({ error: 'Team is full. Ask your manager to upgrade.' }, { status: 403 })
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ company_id: company.id, role: 'rep', display_name: user.email?.split('@')[0] })
    .eq('id', user.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ company })
}
