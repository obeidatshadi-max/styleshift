import { getAuthUser } from '@/lib/auth-user'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getRepReport } from '@/lib/improvement/server'

/** The signed-in rep's own Conversation Snapshot, Behavioral Evolution and Coaching Roadmap. */
export async function GET() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getRepReport(user.id))
}
