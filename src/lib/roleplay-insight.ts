import type { RoleplayResult } from './roleplay-core'

export type RoleplayInsightMetric =
  | 'talkRatio' | 'adaptationScore' | 'questionRatio' | 'openQuestionRatio'
  | 'paraphraseScore' | 'activeListening' | 'rapidSwitches'

export interface RoleplayInsight {
  metric: RoleplayInsightMetric
  /** The metric's own value, already in display scale (percent, score, or a
   * per-minute rate) — the caller interpolates it into the copy for `metric`. */
  value: number
}

const TALK_RATIO_THRESHOLD = 0.65
const ADAPTATION_THRESHOLD = 45
const QUESTION_RATIO_THRESHOLD = 0.2
const OPEN_QUESTION_RATIO_THRESHOLD = 0.3
const PARAPHRASE_THRESHOLD = 0.2
const ACTIVE_LISTENING_THRESHOLD = 45
const RAPID_SWITCHES_PER_MIN_THRESHOLD = 6

/**
 * Picks the single most actionable coaching tip for THIS one roleplay
 * session, checked in fixed priority order (most common/important issue
 * first, first match wins) — not a cross-session pattern like AI Doctor's
 * Mastermind Coach, which needs objection-tagged history this free-form
 * colleague roleplay doesn't have. Returns null when nothing crosses its
 * threshold: a solid session shouldn't get a manufactured critique.
 */
export function buildRoleplayInsight(result: RoleplayResult): RoleplayInsight | null {
  if (result.talkRatio.repRatio > TALK_RATIO_THRESHOLD) {
    return { metric: 'talkRatio', value: Math.round(result.talkRatio.repRatio * 100) }
  }
  if (result.adaptationScore && result.adaptationScore.score < ADAPTATION_THRESHOLD) {
    return { metric: 'adaptationScore', value: result.adaptationScore.score }
  }
  if (result.questionRatio < QUESTION_RATIO_THRESHOLD) {
    return { metric: 'questionRatio', value: Math.round(result.questionRatio * 100) }
  }
  // Only surfaced once the rep clears the question-ratio bar above — a rep
  // asking no questions at all is already caught by that check, and this
  // one specifically flags "asks questions, but mostly closed ones".
  if (result.openQuestionRatio < OPEN_QUESTION_RATIO_THRESHOLD) {
    return { metric: 'openQuestionRatio', value: Math.round(result.openQuestionRatio * 100) }
  }
  if (result.paraphraseScore < PARAPHRASE_THRESHOLD) {
    return { metric: 'paraphraseScore', value: Math.round(result.paraphraseScore * 100) }
  }
  if (result.activeListening.score < ACTIVE_LISTENING_THRESHOLD) {
    return { metric: 'activeListening', value: result.activeListening.score }
  }
  const durationMin = result.durationSec / 60
  const switchesPerMin = durationMin > 0 ? result.rapidTurnSwitches / durationMin : 0
  if (switchesPerMin > RAPID_SWITCHES_PER_MIN_THRESHOLD) {
    return { metric: 'rapidSwitches', value: Math.round(switchesPerMin) }
  }
  return null
}
