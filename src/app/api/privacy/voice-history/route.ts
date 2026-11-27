import { getAuthUser, getLiveAuthUser } from '@/lib/auth-user'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getVoiceHistoryCounts, deleteVoiceHistory } from '@/lib/privacy'

async function requireUser() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  return user
}

/** How many practice-history rows the caller has, across all 6 tables. */
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getVoiceHistoryCounts(user.id))
}

/** Deletes all of the caller's own practice-history rows. */
export async function DELETE() {
  // Live check: deleting history cannot be undone, so a revoked session is refused at once.
  const user = await getLiveAuthUser(await createClient())
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await deleteVoiceHistory(user.id)
  return NextResponse.json({ ok: true })
}
