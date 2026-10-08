import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionRecord } from '@/agents/orchestrator/types'
import type { BehaviorEvent } from '@/schemas/pattern'
import { eventsFromSession } from '@/lib/pattern-events'
import { challengeProgress, recommendNext, type ChallengeProgress, type ChallengeRecommendation } from '@/lib/challenge-engine'

/** Feature flag for recommended challenges (card, recommendation and targeted start). */
export function adaptiveChallengesEnabled(): boolean {
  return process.env.ADAPTIVE_CHALLENGES_ENABLED === 'true'
}

/** How many of the newest finished sessions are looked at. */
const WINDOW = 10

export interface ChallengeData {
  events: BehaviorEvent[]
  /** Every considered session, newest first (including ones with no observed behaviors). */
  sessionIds: string[]
  /** session id -> behavior it was started to practise. */
  targeted: Map<string, string>
}

/** The rep's own finished, scored simulations (row-level security confines the query). */
export async function loadChallengeData(supabase: SupabaseClient, repId: string): Promise<ChallengeData> {
  const { data } = await supabase.from('agent_sessions').select('record')
    .eq('rep_id', repId).in('phase', ['scored', 'reported'])
    .order('created_at', { ascending: false }).limit(WINDOW)
  const sessions = ((data as Array<{ record: SessionRecord }> | null) ?? []).map(r => r.record.session)
  return {
    events: sessions.flatMap(s => eventsFromSession(s)),
    sessionIds: sessions.map(s => s.sessionId),
    targeted: new Map(sessions.flatMap(s => (s.challenge?.behavior ? [[s.sessionId, s.challenge.behavior] as [string, string]] : []))),
  }
}

export interface NextChallenge {
  recommendation: ChallengeRecommendation
  /** Progress for the recommended behavior, once the rep has practised it. */
  progress: ChallengeProgress | null
}

export function nextChallenge(d: ChallengeData, lang: 'en' | 'ar'): NextChallenge {
  const recommendation = recommendNext(d.events, d.sessionIds, lang)
  if (recommendation.status !== 'recommended') return { recommendation, progress: null }
  const behavior = recommendation.weakness.pattern.behavior
  const ids = new Set([...d.targeted].filter(([, b]) => b === behavior).map(([id]) => id))
  return { recommendation, progress: ids.size ? challengeProgress(behavior, d.events, d.sessionIds, ids) : null }
}
