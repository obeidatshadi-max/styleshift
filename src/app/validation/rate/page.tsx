import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { validationEnabled } from '@/lib/validation/assessor-service'
import AssessorPanel from '@/components/AssessorPanel'

export const dynamic = 'force-dynamic'

export default async function RatePage() {
  if (!validationEnabled()) redirect('/play')
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')
  return <main style={{ position: 'relative', maxWidth: 850, margin: 'auto', padding: 24 }}>
    <a href="/play">← StyleShift</a>
    <h1>Rate conversations</h1>
    <p>You rate each case on your own. You will not see who the representative is, which attempt this is, or anyone else&apos;s rating. Cases appear here only while the pilot is running.</p>
    <AssessorPanel />
  </main>
}
