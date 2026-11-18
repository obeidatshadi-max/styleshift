import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ConversationReport } from '@/schemas/conversationReport'
import { REPLAY_DRILL_PREFIX, summarizeCoachProgress, type ProgressEntry } from '@/lib/conversation-coach/progress'

/** The signed-in rep's own progress across recorded conversations. Reads only their rows (rep_id filter + RLS). */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [reports, attempts] = await Promise.all([
    supabase.from('conversation_reports').select('report, created_at')
      .eq('rep_id', user.id).in('session_type', ['human_partner', 'customer_visit'])
      .eq('status', 'complete').is('superseded_by', null)
      .order('created_at', { ascending: true }).limit(100),
    supabase.from('drill_attempts').select('observed_behaviors')
      .eq('rep_id', user.id).like('drill_id', `${REPLAY_DRILL_PREFIX}%`).limit(1000),
  ])
  if (reports.error) return NextResponse.json({ error: 'Could not load progress' }, { status: 500 })

  const entries: ProgressEntry[] = ((reports.data ?? []) as { report: ConversationReport; created_at: string }[])
    .filter(r => r.report?.coach)
    .map(r => ({ at: r.created_at, coach: r.report.coach! }))
  const practice = ((attempts.data ?? []) as { observed_behaviors: string[] | null }[])
    .map(a => ({ result: a.observed_behaviors?.[0] ?? 'unclear' }))
  return NextResponse.json(summarizeCoachProgress(entries, practice))
}
