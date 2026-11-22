import { getAuthUser } from '@/lib/auth-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import GameShell from '@/components/game/GameShell'

export default async function PlayPage() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (!user) redirect('/login')
  return <GameShell />
}
