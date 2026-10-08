import type { StyleShiftSession } from '@/schemas/session'
import type { BehaviorEvent, EventEvidence } from '@/schemas/pattern'

/** A recurring pattern needs this many distinct sessions — one event is an anecdote. */
export const MIN_SESSIONS_FOR_PATTERN = 3
const EVIDENCE_TEXT_MAX = 240

/**
 * Turns one scored session into BehaviorEvents. Source is the deterministic
 * scorer's contributions (behavior key, sign, confidence, evidence turns) plus
 * the session's own context — no model call, nothing inferred. Evidence text
 * is copied from the transcript turn, never generated.
 *
 * A behavior that both helped and hurt in one session (rare) yields two
 * events; they are different facts.
 */
export function eventsFromSession(session: Readonly<StyleShiftSession>): BehaviorEvent[] {
  if (!session.scores) return []
  const turns = new Map(session.transcript.map(t => [t.turnIndex, t]))
  const occurredAt = session.endedAt ?? session.startedAt
  const context = {
    physicianStyle: session.socialStyle.dominant,
    difficulty: session.difficulty,
    language: session.lang,
    objectionType: session.objections.activeType,
    scenarioId: null,
  }
  const events = new Map<string, BehaviorEvent>()
  for (const [competency, comp] of Object.entries(session.scores.competencies)) {
    for (const c of comp.contributions) {
      if (c.points === 0) continue
      const effect = c.points > 0 ? 'helped' : 'hurt'
      const id = `${session.sessionId}:${c.behavior}:${effect}`
      const evidence: EventEvidence[] = []
      for (const idx of c.evidenceTurns) {
        const turn = turns.get(idx)
        if (turn) evidence.push({ turnIndex: idx, role: turn.role, text: turn.text.trim().slice(0, EVIDENCE_TEXT_MAX) })
      }
      const existing = events.get(id)
      if (existing) {
        // Repeated within one session: keep one event, strongest confidence, merge evidence.
        existing.confidence = Math.max(existing.confidence, c.confidence)
        for (const e of evidence) if (!existing.evidence.some(x => x.turnIndex === e.turnIndex)) existing.evidence.push(e)
        continue
      }
      events.set(id, {
        id, sessionId: session.sessionId, behavior: c.behavior, competency, effect,
        confidence: c.confidence, occurredAt, context, evidence,
      })
    }
  }
  return [...events.values()]
}

export type PatternEligibility =
  | { eligible: true; sessions: number }
  | { eligible: false; reason: 'too_few_sessions'; sessions: number; needed: number }

/** Guard before anything is called a "pattern": counts DISTINCT sessions, so ten
 * events from one session still count as one. */
export function patternEligibility(events: readonly BehaviorEvent[]): PatternEligibility {
  const sessions = new Set(events.map(e => e.sessionId)).size
  return sessions >= MIN_SESSIONS_FOR_PATTERN
    ? { eligible: true, sessions }
    : { eligible: false, reason: 'too_few_sessions', sessions, needed: MIN_SESSIONS_FOR_PATTERN }
}
