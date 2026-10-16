import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { ihiaEnabled, isReviewer } from '@/lib/ihia/server'
import IhiaPanel from '@/components/IhiaPanel'

export const dynamic = 'force-dynamic'

export default async function IhiaPage() {
  if (!ihiaEnabled()) redirect('/play')
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')
  return <main style={{ position: 'relative', maxWidth: 850, margin: 'auto', padding: 24 }}>
    <a href="/play">← StyleShift</a>
    <h1>Iraqi Healthcare Intelligence</h1>
    <p>Describe a situation to discover Iraqi expressions, or interpret a phrase using reviewed knowledge. Clinical decisions remain outside this tool.</p>
    <IhiaPanel reviewer={await isReviewer(db, user.id)} />
  </main>
}
