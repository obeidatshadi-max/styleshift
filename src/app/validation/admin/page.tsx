import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { validationEnabled } from '@/lib/validation/assessor-service'
import PilotAdminPanel from '@/components/PilotAdminPanel'

export const dynamic = 'force-dynamic'

export default async function PilotAdminPage() {
  if (!validationEnabled()) redirect('/play')
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')
  return <main style={{ position: 'relative', maxWidth: 850, margin: 'auto', padding: 24 }}>
    <a href="/play">← StyleShift</a>
    <h1>Validation pilot</h1>
    <p>Set up a pilot: who rates, which conversations, and when it runs. Assessors never see the representative, the phase, or each other&apos;s ratings.</p>
    <PilotAdminPanel />
  </main>
}
