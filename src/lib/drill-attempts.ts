import type { SupabaseClient } from '@supabase/supabase-js'
import type { DrillAttempt } from '@/schemas/drill'
import { summarizeDrillHistory, type DrillHistorySummary } from '@/lib/drill-registry'

/** Feature flag for micro-practice (list + attempts). */
export function microPracticeEnabled(): boolean {
  return process.env.MICRO_PRACTICE_ENABLED === 'true'
}

interface Row {
  drill_id: string; drill_version: number; rep_id: string; attempt_no: number; created_at: string
  observed_behaviors: string[]; score: number | null; passed: boolean; lang: 'en' | 'ar'
}

const toAttempt = (r: Row): DrillAttempt => ({
  drillId: r.drill_id, drillVersion: r.drill_version, repId: r.rep_id, attemptNo: r.attempt_no, at: r.created_at,
  observedBehaviors: r.observed_behaviors, score: r.score, passed: r.passed, lang: r.lang,
})

/** All of the rep's attempts, newest first. Uses the caller's own client, so RLS confines it to their rows. */
export async function listAttempts(supabase: SupabaseClient, repId: string): Promise<DrillAttempt[]> {
  const { data } = await supabase.from('drill_attempts').select('*').eq('rep_id', repId).order('created_at', { ascending: false }).limit(1000)
  return ((data as Row[] | null) ?? []).map(toAttempt)
}

export function historyByDrill(attempts: readonly DrillAttempt[]): Record<string, DrillHistorySummary> {
  const grouped = new Map<string, DrillAttempt[]>()
  for (const a of attempts) grouped.set(a.drillId, [...(grouped.get(a.drillId) ?? []), a])
  return Object.fromEntries([...grouped].map(([id, list]) => [id, summarizeDrillHistory(list)]))
}

/** Attempts at this drill since the start of the current UTC day: retries are capped per day, not forever. */
export function attemptsToday(attempts: readonly DrillAttempt[], drillId: string, now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return attempts.filter(a => a.drillId === drillId && Date.parse(a.at) >= start).length
}

export async function saveAttempt(supabase: SupabaseClient, a: Omit<DrillAttempt, 'at'>): Promise<boolean> {
  const { error } = await supabase.from('drill_attempts').insert({
    rep_id: a.repId, drill_id: a.drillId, drill_version: a.drillVersion, attempt_no: a.attemptNo,
    lang: a.lang, observed_behaviors: a.observedBehaviors, score: a.score, passed: a.passed,
  })
  return !error
}
