import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

/** Lets a manager rotate their team's invite code — e.g. after sharing it too widely. */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id || profile.role !== 'manager') {
    return NextResponse.json({ error: 'Not a manager' }, { status: 403 })
  }

  const newCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const { data: company, error } = await admin
    .from('companies')
    .update({ invite_code: newCode })
    .eq('id', profile.company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ company })
}
