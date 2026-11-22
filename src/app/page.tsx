import { getAuthUser } from '@/lib/auth-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Landing from '@/components/landing/Landing'

export default async function RootPage() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (user) redirect('/play')
  return <Landing />
}
