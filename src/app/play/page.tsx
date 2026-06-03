import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import GameShell from '@/components/game/GameShell'

export default async function PlayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <GameShell />
}
