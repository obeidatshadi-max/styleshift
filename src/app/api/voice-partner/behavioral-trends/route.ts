import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isObjectionType, isClearStep, type ClearStep } from '@/lib/voice-partner-core'
import { computeBehavioralGravity, type GravitySessionRow } from '@/lib/behavioral-gravity'
import { detectUnusedResources, type CapabilityUsageRow } from '@/lib/unused-resource-detector'
import { buildMastermindInsights } from '@/lib/mastermind-coach'
import type { SessionSignals } from '@/lib/session-evaluator'

// Phase 5 ("Behavioral Pattern Intelligence") surfacing route — computed
// LIVE on every request from the rep's own `voice_partner_sessions` (trigger
// + outcome) joined with `session_scorecards` (persisted SessionSignals from
// Phase 2's Deep Analysis), same "no cron/materialized cache" precedent as
// /api/champions and team-pulse.ts. No rate limit: unlike the voice-partner
// turn/open/speak/session-analysis routes, this makes no outbound LLM/STT/TTS
// call and no write — it's a read over the caller's own already-persisted
// rows, the same cost shape as /api/champions (unguarded) rather than the
// shared 'voice-partner' bucket (guards against burning paid-API budget).
//
// Follows session-analysis/route.ts's own convention (query inline in the
// route, hand plain data to pure lib functions) rather than introducing a
// DB-touching lib module — behavioral-gravity.ts and unused-resource-
// detector.ts stay pure/testable with zero Supabase dependency, same as
// pressure-shift.ts and session-evaluator.ts's computeSessionSignals.

function asSessionSignals(v: unknown): SessionSignals | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.repTurnCount !== 'number' || typeof o.avgRepTurnLength !== 'number'
    || typeof o.openQuestionRatio !== 'number' || typeof o.clearStepsHitCount !== 'number'
    || !Array.isArray(o.clearStepsSequence)) return null
  return o as unknown as SessionSignals
}

export async function GET() {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // RLS scopes both reads to the caller's own rows (own conversation
  // turns/scorecards read policies — migrations 014/026-028) — the explicit
  // .eq('rep_id', ...) is defense-in-depth, not the only gate.
  const [{ data: sessionsData }, { data: scorecardsData }] = await Promise.all([
    supabase.from('voice_partner_sessions').select('id, objection_type, outcome').eq('rep_id', user.id),
    supabase.from('session_scorecards').select('session_id, signals, adaptation_score').eq('rep_id', user.id),
  ])

  const sessions = (sessionsData as { id: string; objection_type: string | null; outcome: string | null }[] | null) ?? []
  const scorecards = (scorecardsData as { session_id: string; signals: unknown; adaptation_score: number | null }[] | null) ?? []
  const scorecardBySession = new Map(scorecards.map(s => [s.session_id, s]))

  const gravityRows: GravitySessionRow[] = []
  const usageRows: CapabilityUsageRow[] = []

  for (const session of sessions) {
    if (!isObjectionType(session.objection_type)) continue
    if (session.outcome !== 'won' && session.outcome !== 'escalated') continue
    // Only sessions with a scorecard (i.e. Deep Analysis has run at least
    // once) carry real SessionSignals — a session nobody has analyzed yet
    // is skipped rather than compared with fabricated/zeroed signals.
    const scorecard = scorecardBySession.get(session.id)
    if (!scorecard) continue
    const signals = asSessionSignals(scorecard.signals)
    if (!signals) continue

    const clearStepsHit: ClearStep[] = signals.clearStepsSequence.filter(isClearStep)

    gravityRows.push({
      sessionId: session.id,
      objectionType: session.objection_type,
      outcome: session.outcome,
      adaptationScore: scorecard.adaptation_score,
      avgRepTurnLength: signals.avgRepTurnLength,
      openQuestionRatio: signals.openQuestionRatio,
      clearStepsPerTurn: signals.repTurnCount ? signals.clearStepsHitCount / signals.repTurnCount : 0,
    })
    usageRows.push({ sessionId: session.id, objectionType: session.objection_type, clearStepsHit })
  }

  const gravity = computeBehavioralGravity(gravityRows)
  const unusedResources = detectUnusedResources(usageRows)

  // Phase 6 (Mastermind Coach): included here for parity with the manager
  // dashboard read path (behavioral-trends-dashboard.ts), computed for free
  // from the same rows above. No rep-facing UI consumes this yet — that's a
  // deferred decision, not an oversight; see project memory.
  return NextResponse.json({ gravity, unusedResources, mastermindInsights: buildMastermindInsights(gravity, unusedResources) })
}
