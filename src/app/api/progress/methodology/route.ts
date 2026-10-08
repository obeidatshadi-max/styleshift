import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { loadChallengeData } from '@/lib/challenge-load'
import { activeMethodologyFor, methodologyBuilderEnabled } from '@/lib/methodologies'
import { stageCoverage, stageStatus } from '@/schemas/methodology'

/**
 * The rep's recent practice seen through their company's stages. Same detected
 * behaviors as everywhere else, grouped by the company's own stages and
 * shown by name. Descriptive; it produces no score.
 */
export async function GET() {
  if (!methodologyBuilderEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const methodology = await activeMethodologyFor(user.id)
  if (!methodology) return NextResponse.json({ methodology: null })
  const data = await loadChallengeData(supabase, user.id)
  const coverage = stageCoverage(methodology, data.events.map(e => e.behavior))
  return NextResponse.json({
    methodology,
    sessionsConsidered: data.sessionIds.length,
    stages: coverage.map(c => ({ ...c, status: stageStatus(c) })),
  })
}
