import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getGroupStandings } from '@/lib/group-standings'

export type { GroupInfo } from '@/lib/group-standings'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getGroupStandings(user.id)
  return NextResponse.json(data)
}

// Any signed-in rep can create their own group (they become its owner and
// first member), then share its invite link.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('profiles')
    .select('group_id')
    .eq('id', user.id)
    .single()
  if (existing?.group_id) return NextResponse.json({ error: 'Already in a group' }, { status: 409 })

  const { data: group, error: groupError } = await admin
    .from('groups')
    .insert({ owner_id: user.id })
    .select('id, name, invite_code')
    .single()
  if (groupError || !group) return NextResponse.json({ error: groupError?.message ?? 'Could not create group' }, { status: 500 })

  const { error: updateError } = await admin
    .from('profiles')
    .update({ group_id: group.id })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ group: { id: group.id, name: group.name, inviteCode: group.invite_code, isOwner: true } })
}
