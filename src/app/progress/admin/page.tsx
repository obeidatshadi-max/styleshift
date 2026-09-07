import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ProgressDashboard from '@/components/progress/ProgressDashboard'

export const dynamic = 'force-dynamic'

export default async function ProgressAdminPage() {
  const supabase = await createClient()
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/progress/admin')
  return <ProgressDashboard editable ownerId={user.id} />
}
