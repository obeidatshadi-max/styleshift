import { getAuthUser } from '@/lib/auth-user'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getStandings } from '@/lib/standings'

export type { Standing, Standings } from '@/lib/standings'

export async function GET() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getStandings(user.id)
  return NextResponse.json(data)
}
