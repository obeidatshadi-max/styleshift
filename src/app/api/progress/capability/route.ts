import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { capabilityIqEnabled, loadCapabilityReport } from '@/lib/capability-load'

/** The rep's own capability dimensions (Interaction, Clinical, Adaptation, Discovery, Commitment). */
export async function GET() {
  if (!capabilityIqEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await loadCapabilityReport(supabase, user.id))
}
