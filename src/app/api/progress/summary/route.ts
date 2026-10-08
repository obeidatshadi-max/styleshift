import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { loadProgress, progressTrackingEnabled } from '@/lib/progress-load'

/** The rep's own progress summary. `tz` is minutes east of UTC, so days and weeks follow the rep's local clock. */
export async function GET(req: Request) {
  if (!progressTrackingEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const tz = Number(new URL(req.url).searchParams.get('tz'))
  return NextResponse.json(await loadProgress(supabase, user.id, new Date(), Number.isFinite(tz) ? tz : 0))
}
