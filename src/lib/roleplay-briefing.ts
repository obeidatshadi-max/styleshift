import type { RoleplaySessionSummary } from '@/types/game'
import { metricValue, SCALE, type RoleplayMetricKey } from './roleplay-aggregate'
import { andButOnGoal } from './roleplay-language'
import {
  TALK_RATIO_THRESHOLD, ADAPTATION_THRESHOLD, QUESTION_RATIO_THRESHOLD,
  OPEN_QUESTION_RATIO_THRESHOLD, PARAPHRASE_THRESHOLD, ACTIVE_LISTENING_THRESHOLD,
} from './roleplay-insight'

// Same order buildRoleplayInsight uses, so the "last time" tip here and the
// Coach's Tip shown right after that session never disagree.
const FOCUS_ORDER: RoleplayMetricKey[] = ['talkRatio', 'adaptationScore', 'questionRatio', 'openQuestionRatio', 'paraphraseScore', 'activeListening']
const STRENGTH_ORDER: RoleplayMetricKey[] = ['activeListening', 'adaptationScore', 'openQuestionRatio', 'paraphraseScore', 'questionRatio', 'talkRatio']

/** A session's value for one metric as the rep sees it: percent, or a 0-100 score. */
export function displayValue(s: RoleplaySessionSummary, key: RoleplayMetricKey): number | null {
  const v = metricValue(s, key)
  return v == null ? null : Math.round(v * SCALE[key])
}

/** "%" for ratios, "/100" for the two scores. */
export function metricUnit(key: RoleplayMetricKey): '%' | '/100' {
  return key === 'activeListening' || key === 'adaptationScore' ? '/100' : '%'
}

/** Whether a displayed value is on the good side of the coaching goal. */
export function meetsGoal(key: RoleplayMetricKey, shown: number): boolean {
  switch (key) {
    case 'talkRatio': return shown <= TALK_RATIO_THRESHOLD * 100
    case 'adaptationScore': return shown >= ADAPTATION_THRESHOLD
    case 'questionRatio': return shown >= QUESTION_RATIO_THRESHOLD * 100
    case 'openQuestionRatio': return shown >= OPEN_QUESTION_RATIO_THRESHOLD * 100
    case 'paraphraseScore': return shown >= PARAPHRASE_THRESHOLD * 100
    case 'activeListening': return shown >= ACTIVE_LISTENING_THRESHOLD
  }
}

export type LanguageSkill = 'empathy' | 'paraphrasing' | 'andBut' | 'buildOnPositive'

/**
 * Word-level skills the rep did not show in a session. Empty when the session
 * predates tracking (no `language`) — absence of data is not a miss. "and/but"
 * and "build on the positive" only count as missed when there was something
 * to judge (some "but" said, or a positive remark made).
 */
export function missedLanguageSkills(s: RoleplaySessionSummary): LanguageSkill[] {
  const l = s.language
  if (!l) return []
  const missed: LanguageSkill[] = []
  if (l.empathy.count === 0) missed.push('empathy')
  if (l.paraphrasing.count === 0) missed.push('paraphrasing')
  if (!andButOnGoal(l.andBut)) missed.push('andBut')
  if (l.buildOnPositive.positives > 0 && l.buildOnPositive.builtOn < l.buildOnPositive.positives) missed.push('buildOnPositive')
  return missed
}

export interface RoleplayBriefing {
  count: number
  lastAt: string
  /** The weakest point of the most recent session, or null when it went well. */
  focus: { metric: RoleplayMetricKey; value: number } | null
  /** A point the rep did well in the most recent session, if any. */
  strength: { metric: RoleplayMetricKey; value: number } | null
  /** Word-level skills not shown last time (empathy, paraphrasing, and/but, build on positive). */
  missedSkills: LanguageSkill[]
}

/**
 * Short "what to remember" summary from saved sessions (newest first). It only
 * reads the most recent session — the rep is about to record the next one, so
 * "what happened last time" is the useful part; long-run averages and trends
 * are shown separately by the summary card.
 */
export function buildRoleplayBriefing(sessions: RoleplaySessionSummary[]): RoleplayBriefing | null {
  const last = sessions[0]
  if (!last) return null

  let focus: RoleplayBriefing['focus'] = null
  for (const metric of FOCUS_ORDER) {
    const value = displayValue(last, metric)
    if (value != null && !meetsGoal(metric, value)) { focus = { metric, value }; break }
  }

  let strength: RoleplayBriefing['strength'] = null
  for (const metric of STRENGTH_ORDER) {
    const value = displayValue(last, metric)
    if (value != null && meetsGoal(metric, value)) { strength = { metric, value }; break }
  }

  return { count: sessions.length, lastAt: last.created_at, focus, strength, missedSkills: missedLanguageSkills(last) }
}
