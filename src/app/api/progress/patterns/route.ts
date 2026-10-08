import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { loadChallengeData } from '@/lib/challenge-load'
import { buildInsights, patternMemoryEnabled, PATTERN_MEMORY_RULES } from '@/lib/pattern-memory'

/** The rep's own recurring patterns, recomputed from their stored simulations on every call. Nothing is saved. */
export async function GET() {
  if (!patternMemoryEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const data = await loadChallengeData(supabase, user.id, PATTERN_MEMORY_RULES.window)
  return NextResponse.json({ sessionsConsidered: data.sessionIds.length, insights: buildInsights(data.events, data.sessionIds) })
}
