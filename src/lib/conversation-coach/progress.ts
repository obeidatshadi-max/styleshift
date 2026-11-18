import { OPPORTUNITY_KEYS, type ConversationCoach, type OpportunityKey } from './types'

// Progress across recordings, built from opportunity counts ("clarified 2 of 3 concerns"), never from a score.
// A comparison is only made when there are enough comparable recordings; otherwise it says so.

/** Earlier recordings needed before the latest one is compared with them. Same floor as the improvement engine's MIN_BASELINE. */
export const MIN_EARLIER_RECORDINGS = 2
/** Opportunities needed on each side so one sentence cannot flip the result. */
export const MIN_EARLIER_OPPORTUNITIES = 3
export const MIN_LATEST_OPPORTUNITIES = 2
/** A rate difference smaller than this is reported as similar. Display rule, not a validated threshold. */
export const MIN_RATE_CHANGE = 0.2
/** Prefix of drill_attempts.drill_id for replay-practice attempts. Kept out of drill scores and the improvement engine. */
export const REPLAY_DRILL_PREFIX = 'replay:'

export interface ProgressEntry { at: string; coach: ConversationCoach }
export type Comparison = 'not_enough_data' | 'higher' | 'lower' | 'similar'

export interface KeyProgress {
  key: OpportunityKey
  /** Recordings where this measure applied. */
  recordings: number
  latest: { numerator: number; denominator: number | null } | null
  earlier: { numerator: number; denominator: number; recordings: number } | null
  comparison: Comparison
}

export interface CoachProgressSummary {
  recordings: number
  /** Recordings the rep marked as only part of a visit; they are excluded from comparisons. */
  partialRecordings: number
  keys: KeyProgress[]
  practice: { attempts: number; criterionMet: number }
}

export function summarizeCoachProgress(
  entries: readonly ProgressEntry[],
  practice: readonly { result: string }[],
): CoachProgressSummary {
  const real = entries.filter(e => !e.coach.synthetic).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const complete = real.filter(e => !e.coach.structure.partialRecording)
  const keys = OPPORTUNITY_KEYS.map((key): KeyProgress => {
    const applicable = complete
      .map(e => e.coach.opportunities.find(o => o.key === key))
      .filter((o): o is NonNullable<typeof o> => !!o && !o.notApplicable)
    const latestO = applicable[applicable.length - 1] ?? null
    const prior = applicable.slice(0, -1).filter(o => o.denominator !== null)
    const earlier = prior.length ? {
      numerator: prior.reduce((a, o) => a + o.numerator, 0),
      denominator: prior.reduce((a, o) => a + (o.denominator ?? 0), 0),
      recordings: prior.length,
    } : null
    let comparison: Comparison = 'not_enough_data'
    if (latestO && latestO.denominator !== null && earlier && earlier.recordings >= MIN_EARLIER_RECORDINGS &&
        earlier.denominator >= MIN_EARLIER_OPPORTUNITIES && latestO.denominator >= MIN_LATEST_OPPORTUNITIES) {
      const diff = latestO.numerator / latestO.denominator - earlier.numerator / earlier.denominator
      comparison = Math.abs(diff) < MIN_RATE_CHANGE ? 'similar' : diff > 0 ? 'higher' : 'lower'
    }
    return {
      key, recordings: applicable.length,
      latest: latestO ? { numerator: latestO.numerator, denominator: latestO.denominator } : null,
      earlier, comparison,
    }
  })
  return {
    recordings: real.length,
    partialRecordings: real.length - complete.length,
    keys,
    practice: { attempts: practice.length, criterionMet: practice.filter(p => p.result === 'met').length },
  }
}
