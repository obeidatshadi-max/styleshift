import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionRecord } from '@/agents/orchestrator/types'
import { computeCapabilityIQ } from '@/lib/capability-iq'
import { listAttempts } from '@/lib/drill-attempts'
import { drillRegistry } from '@/lib/drill-templates'
import { eventsFromSession } from '@/lib/pattern-events'
import { progressReport, type ProgressReport } from '@/lib/progress'

/** Feature flag for the progress card. */
export function progressTrackingEnabled(): boolean {
  return process.env.PROGRESS_TRACKING_ENABLED === 'true'
}

/** How many of the newest finished simulations are read. Older history is outside the window by design. */
const SESSION_WINDOW = 30

/** The rep's own progress. Uses the caller's client, so row-level security confines every read to their rows. */
export async function loadProgress(supabase: SupabaseClient, repId: string, now: Date, tzOffsetMin = 0): Promise<ProgressReport> {
  const [{ data }, attempts] = await Promise.all([
    supabase.from('agent_sessions').select('record').eq('rep_id', repId).in('phase', ['scored', 'reported'])
      .order('created_at', { ascending: false }).limit(SESSION_WINDOW),
    listAttempts(supabase, repId),
  ])
  const sessions = ((data as Array<{ record: SessionRecord }> | null) ?? []).map(r => r.record.session)
  return progressReport({
    sessions, attempts, now, tzOffsetMin,
    drillTypeOf: id => drillRegistry.get(id)?.type,
    capability: computeCapabilityIQ(sessions.flatMap(s => eventsFromSession(s))),
  })
}
