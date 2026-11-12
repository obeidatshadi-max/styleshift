import type { RoleplaySessionSummary } from '@/types/game'
import type { DrillAttempt } from '@/schemas/drill'
import { isObjectionType } from '@/lib/voice-partner-core'
import { round1, type PracticeRecord } from './metrics'

// Adapters: each existing practice store -> the common PracticeRecord. Pure; the
// caller does the (RLS- or company-scoped) read. A field that is absent or not a
// finite number becomes null ("not measured"), never 0.

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pct = (v: unknown): number | null => { const n = num(v); return n === null ? null : round1(n * 100) }

/** A recorded colleague/doctor roleplay (roleplay_sessions). Ratios are stored 0-1. */
export function fromRoleplaySummary(s: RoleplaySessionSummary, scenarioKey: string | null = null): PracticeRecord {
  return {
    id: s.id, at: s.created_at, source: 'colleague_roleplay', scenarioKey, criticalMoments: null,
    metrics: {
      talk_ratio: pct(s.talk_ratio),
      open_question_ratio: pct(s.open_question_ratio),
      paraphrase_score: pct(s.paraphrase_score),
      active_listening: num(s.active_listening_score),
      // roleplay_sessions.adaptation_score is NOT read: it is the distance between two
      // social-style reads made from speaking speed and pitch, not adaptation to a person.
    },
  }
}

export interface ScorecardRow {
  session_id: string
  created_at: string
  signals: unknown
  adaptation_score: number | null
}

/** An AI-Doctor session: the scorecard (Deep Analysis ran) + the session's objection type. */
export function fromScorecard(row: ScorecardRow, objectionType: string | null, criticalMoments: number | null = null): PracticeRecord | null {
  const s = row.signals as Record<string, unknown> | null
  if (!s || typeof s !== 'object') return null
  const turns = num(s.repTurnCount)
  const steps = num(s.clearStepsHitCount)
  const open = num(s.openQuestionRatio)
  return {
    id: row.session_id, at: row.created_at, source: 'ai_doctor',
    scenarioKey: isObjectionType(objectionType) ? objectionType : null,
    criticalMoments,
    metrics: {
      open_question_ratio: open === null ? null : round1(open * 100),
      clear_steps_per_turn: turns && steps !== null ? round1((steps / turns) * 100) / 100 : null,
      adaptation_score: num(row.adaptation_score),
    },
  }
}

/** One assessed drill attempt. Unassessed attempts (score null) carry no metric. */
export function fromDrillAttempt(a: DrillAttempt): PracticeRecord {
  return {
    id: `${a.drillId}#${a.attemptNo}@${a.at}`, at: a.at, source: 'drill', scenarioKey: a.drillId, criticalMoments: null,
    metrics: { drill_score: num(a.score) },
  }
}
