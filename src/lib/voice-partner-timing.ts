import type { ConversationTurn } from '@/types/game'
import { computeTalkRatio, computeRapidTurnSwitches, type Turn, type TalkRatio } from '@/lib/roleplay-core'

// Phase 5 (realtime hardening) — real per-turn speech timing, populated only
// by the Pipecat realtime bot (migration 030). Reuses roleplay-core.ts's
// proven talk-ratio/interruption-proxy math verbatim instead of
// reimplementing it — same "server computes, model only interprets" split as
// session-evaluator.ts and pressure-shift.ts.

export interface RealtimeSignals {
  talkRatio: TalkRatio
  interruptionCount: number
  /** Avg gap (ms) between a rep turn ending and the next doctor turn
   * starting, across all such pairs — 0 or negative gaps (true overlap) are
   * included as 0, never negative, since "the doctor started before the rep
   * finished" is an interruption, not negative latency. */
  avgResponseLatencyMs: number
}

/** True when at least one turn carries a complete {started_at, ended_at}
 * pair — the realtime path's presence signal. A mixed session (some turns
 * timed, some not, e.g. a reconnect) still computes signals from whichever
 * turns have real timing; turns missing either timestamp are excluded, never
 * treated as zero-duration. */
export function hasTimingData(turns: ConversationTurn[]): boolean {
  return turns.some(t => t.started_at != null && t.ended_at != null)
}

function toTimedTurn(t: ConversationTurn): Turn | null {
  if (t.started_at == null || t.ended_at == null) return null
  const start = Date.parse(t.started_at)
  const end = Date.parse(t.ended_at)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { speaker: t.role, text: t.text, start, end, durationMs: end - start }
}

function computeAvgResponseLatency(turns: Turn[]): number {
  const sorted = [...turns].sort((a, b) => a.start - b.start)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].speaker === 'doctor' && sorted[i - 1].speaker === 'rep') {
      gaps.push(Math.max(0, sorted[i].start - sorted[i - 1].end))
    }
  }
  return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
}

/** Builds RealtimeSignals from whichever turns carry real timing. Returns
 * null when no turn has timing (text-based-path session, or a realtime
 * session whose timing capture failed silently — never fabricates zeros in
 * either case, matching pressure-shift.ts's "report not applicable rather
 * than compare against a fabricated baseline" rule). */
export function computeRealtimeSignals(turns: ConversationTurn[]): RealtimeSignals | null {
  if (!hasTimingData(turns)) return null
  const timed = turns.map(toTimedTurn).filter((t): t is Turn => t !== null)
  if (timed.length < 2) return null
  const sorted = [...timed].sort((a, b) => a.start - b.start)
  return {
    talkRatio: computeTalkRatio(sorted, 'rep'),
    interruptionCount: computeRapidTurnSwitches(sorted, 0), // strict overlap only: next turn starts before the previous one ends
    avgResponseLatencyMs: computeAvgResponseLatency(sorted),
  }
}
