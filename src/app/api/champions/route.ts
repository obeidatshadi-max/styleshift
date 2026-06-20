import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getChampions } from '@/lib/champions'

export type { Champion, Champions } from '@/lib/champions'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getChampions(user.id)
  return NextResponse.json(data)
}
