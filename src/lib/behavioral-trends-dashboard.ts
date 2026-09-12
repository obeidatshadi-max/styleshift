import { createAdminClient } from '@/lib/supabase-admin'
import { isObjectionType, isClearStep, type ClearStep } from '@/lib/voice-partner-core'
import { computeBehavioralGravity, type GravitySessionRow, type BehavioralGravityResult } from '@/lib/behavioral-gravity'
import { detectUnusedResources, type CapabilityUsageRow, type UnusedResourceFinding } from '@/lib/unused-resource-detector'
import type { SessionSignals } from '@/lib/session-evaluator'

// Manager-dashboard surfacing for AI Doctor Phase 5 ("Behavioral Pattern
// Intelligence"). The per-rep computation (computeBehavioralGravity /
// detectUnusedResources) already exists and is exercised by the rep-facing
// GET /api/voice-partner/behavioral-trends route; this module is the
// MANAGER-scoped read of the same underlying data, across every rep in a
// company at once, following this repo's established manager-dashboard
// convention (voice-stats.ts/getVoiceStats): a plain async function called
// directly from the server-rendered `/dashboard` page, using the admin
// client with an explicit `.in('rep_id', repIds)` filter — not a client
// self-fetching `/api/...` route. The rep-facing route stays untouched
// (RLS-scoped to `auth.uid()`, correct for its own use case); this is a
// second, independent read path for the manager view, same relationship
// team-pulse.ts/getTeamPulse has to the rep-facing daily-challenge reads.
//
// FLAGGED DECISION: per-rep detail (not a company-level aggregate only).
// Every existing manager panel (CoachingQueuePanel, VoicePracticePanel,
// SkillHeatmap, Leaderboard) already names individual reps — a manager
// dashboard in this app is explicitly a coaching tool, not an anonymized
// aggregate view. Following that established convention rather than
// introducing a new privacy posture here.
//
// The row-shaping logic below (raw session/scorecard rows -> GravitySessionRow
// / CapabilityUsageRow) duplicates the equivalent block in
// api/voice-partner/behavioral-trends/route.ts rather than sharing it — that
// route is already shipped and tested (Phase 5, commit b489081); refactoring
// it to share code with a brand-new multi-rep path was judged higher-risk
// than a small, stable, independently-testable duplication.

function asSessionSignals(v: unknown): SessionSignals | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.repTurnCount !== 'number' || typeof o.avgRepTurnLength !== 'number'
    || typeof o.openQuestionRatio !== 'number' || typeof o.clearStepsHitCount !== 'number'
    || !Array.isArray(o.clearStepsSequence)) return null
  return o as unknown as SessionSignals
}

export interface RepBehavioralTrends {
  gravity: BehavioralGravityResult | null
  unusedResources: UnusedResourceFinding[]
}

/** Pure: groups already-fetched raw rows by rep, then runs the existing
 * Phase 5 pure functions per rep. Exported separately from the DB read so
 * it's directly testable without a Supabase client. */
export function buildBehavioralTrendsByRep(
  repIds: string[],
  sessions: { rep_id: string; id: string; objection_type: string | null; outcome: string | null }[],
  scorecards: { rep_id: string; session_id: string; signals: unknown }[],
): Map<string, RepBehavioralTrends> {
  const scorecardBySession = new Map(scorecards.map(s => [s.session_id, s]))
  const gravityByRep = new Map<string, GravitySessionRow[]>()
  const usageByRep = new Map<string, CapabilityUsageRow[]>()
  for (const repId of repIds) {
    gravityByRep.set(repId, [])
    usageByRep.set(repId, [])
  }

  for (const session of sessions) {
    if (!isObjectionType(session.objection_type)) continue
    if (session.outcome !== 'won' && session.outcome !== 'escalated') continue
    const scorecard = scorecardBySession.get(session.id)
    if (!scorecard) continue
    const signals = asSessionSignals(scorecard.signals)
    if (!signals) continue

    const clearStepsHit: ClearStep[] = signals.clearStepsSequence.filter(isClearStep)
    const gravityRows = gravityByRep.get(session.rep_id)
    const usageRows = usageByRep.get(session.rep_id)
    if (!gravityRows || !usageRows) continue // rep not in the requested set

    gravityRows.push({
      sessionId: session.id,
      objectionType: session.objection_type,
      outcome: session.outcome,
      adaptationScore: null,
      avgRepTurnLength: signals.avgRepTurnLength,
      openQuestionRatio: signals.openQuestionRatio,
      clearStepsPerTurn: signals.repTurnCount ? signals.clearStepsHitCount / signals.repTurnCount : 0,
    })
    usageRows.push({ sessionId: session.id, objectionType: session.objection_type, clearStepsHit })
  }

  const result = new Map<string, RepBehavioralTrends>()
  for (const repId of repIds) {
    result.set(repId, {
      gravity: computeBehavioralGravity(gravityByRep.get(repId) ?? []),
      unusedResources: detectUnusedResources(usageByRep.get(repId) ?? []),
    })
  }
  return result
}

/** Manager dashboard read: Behavioral Gravity + Unused Resource Detector for
 * every rep in `repIds` at once. Mirrors getVoiceStats' shape (admin client,
 * explicit .in('rep_id', repIds) filter, empty-safe with no reps). */
export async function getBehavioralTrendsForReps(repIds: string[]): Promise<Map<string, RepBehavioralTrends>> {
  if (repIds.length === 0) return new Map()

  const admin = createAdminClient()
  const [{ data: sessionsData }, { data: scorecardsData }] = await Promise.all([
    admin.from('voice_partner_sessions').select('rep_id, id, objection_type, outcome').in('rep_id', repIds),
    admin.from('session_scorecards').select('rep_id, session_id, signals').in('rep_id', repIds),
  ])

  const sessions = (sessionsData as { rep_id: string; id: string; objection_type: string | null; outcome: string | null }[] | null) ?? []
  const scorecards = (scorecardsData as { rep_id: string; session_id: string; signals: unknown }[] | null) ?? []

  return buildBehavioralTrendsByRep(repIds, sessions, scorecards)
}
