import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionRecord } from '@/agents/orchestrator/types'
import { computeCapabilityIQ, type CapabilityReport } from '@/lib/capability-iq'
import { eventsFromSession } from '@/lib/pattern-events'
import { defaultCapabilityConfig } from '@/scoring/capability'

/** Feature flag for capability scores and the progress card. */
export function capabilityIqEnabled(): boolean {
  return process.env.CAPABILITY_IQ_ENABLED === 'true'
}

/**
 * The rep's capability report from their own scored simulations. Uses the
 * caller's client, so row-level security confines it to their sessions.
 * Only finished, scored sessions count; an in-progress one has no scores.
 */
export async function loadCapabilityReport(supabase: SupabaseClient, repId: string): Promise<CapabilityReport> {
  const { data } = await supabase.from('agent_sessions').select('record')
    .eq('rep_id', repId).in('phase', ['scored', 'reported'])
    .order('created_at', { ascending: false }).limit(defaultCapabilityConfig.window * 2)
  const events = ((data as Array<{ record: SessionRecord }> | null) ?? []).flatMap(r => eventsFromSession(r.record.session))
  return computeCapabilityIQ(events)
}
