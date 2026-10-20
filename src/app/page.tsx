import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Landing from '@/components/landing/Landing'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/play')
  return <Landing />
}
