import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { canJoinGroup } from '@/lib/group-standings'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Authenticated already, but still brute-forceable across groups' invite codes.
  if (!(await checkRateLimit('group-join', user.id, 15, 600)))
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })

  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: 'Invite code required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: group, error: groupError } = await admin
    .from('groups')
    .select('id, name')
    .eq('invite_code', code)
    .single()
  if (groupError || !group) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })

  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id)
  if (!canJoinGroup(count ?? 0)) return NextResponse.json({ error: 'Group is full.' }, { status: 403 })

  const { error: updateError } = await admin
    .from('profiles')
    .update({ group_id: group.id })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ group })
}
