import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getManagerBoard } from '@/lib/improvement/server'

/** Manager view: improvement reports and follow-ups for reps of the manager's own company only. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const board = await getManagerBoard(user.id)
  if (!board) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return NextResponse.json({ reps: board })
}
