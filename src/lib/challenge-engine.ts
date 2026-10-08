import type { StyleKey } from '@/types/game'
import type { BehaviorEvent, PatternRecord } from '@/schemas/pattern'
import { validateSimScenario, type SimDifficulty, type SimScenario } from '@/schemas/scenario'
import type { Difficulty, ObjectionType } from '@/lib/voice-partner-core'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { buildPatternRecords } from '@/lib/pattern-records'
import { MIN_SESSIONS_FOR_PATTERN } from '@/lib/pattern-events'
import { CHALLENGE_MAP, type ChallengeTarget } from '@/lib/challenge-map'

/** A weakness not seen in this many of the newest sessions is treated as resolved, not recommended. */
const STILL_RECENT_WITHIN = 5

export type ConfidenceLevel = 'low' | 'medium' | 'high'

/** Observed pattern + the numbers used to rank it. Interpretation is added by the UI as hedged text. */
export interface Weakness {
  pattern: PatternRecord
  /** Share of considered sessions where it occurred, 0-1. */
  frequency: number
  /** How much it costs in the scoring catalog (|points| scaled to 0-1) times how sure the analyst was. */
  severity: number
  priority: number
  confidenceLevel: ConfidenceLevel
}

export interface TargetedSetup {
  physicianStyle: StyleKey
  difficulty: SimDifficulty
  objectionType: ObjectionType
  language: 'en' | 'ar'
}

export type ChallengeRecommendation =
  | {
      status: 'recommended'
      weakness: Weakness
      alternatives: Weakness[]
      exercise: { drillId: string; targeted: TargetedSetup }
      /** A recommendation never edits scoring weights. */
      changesScoringConfig: false
    }
  | { status: 'no_pattern'; sessionsConsidered: number; sessionsNeeded: number }

const maxPoints = Math.max(...[...behaviorIndex(defaultScoringConfig).values()].map(v => Math.abs(v.rule.points)))

export function confidenceLevel(p: PatternRecord): ConfidenceLevel {
  const points = (p.sessionsWith >= 5 ? 1 : 0) + (p.confidence >= 0.7 ? 1 : 0) + (p.trend !== 'unclear' ? 1 : 0)
  return points >= 3 ? 'high' : points === 2 ? 'medium' : 'low'
}

/** Recurring behaviors that hurt the conversation, ranked. Deterministic: same history, same order. */
export function rankWeaknesses(events: readonly BehaviorEvent[], sessionIdsNewestFirst: readonly string[]): Weakness[] {
  const catalog = behaviorIndex(defaultScoringConfig)
  const n = Math.max(1, sessionIdsNewestFirst.length)
  return buildPatternRecords(events, sessionIdsNewestFirst)
    .filter(p => p.effect === 'hurt' && p.behavior in CHALLENGE_MAP && p.recencySessions < STILL_RECENT_WITHIN)
    .map(pattern => {
      const frequency = pattern.sessionsWith / n
      const severity = ((Math.abs(catalog.get(pattern.behavior)?.rule.points ?? 0)) / maxPoints) * pattern.confidence
      const recency = 1 - pattern.recencySessions / STILL_RECENT_WITHIN
      const trendBonus = pattern.trend === 'worsening' ? 0.1 : pattern.trend === 'stable' ? 0.05 : 0
      const priority = frequency * 0.4 + severity * 0.3 + recency * 0.2 + trendBonus
      return { pattern, frequency, severity, priority, confidenceLevel: confidenceLevel(pattern) }
    })
    .sort((a, b) => b.priority - a.priority || a.pattern.behavior.localeCompare(b.pattern.behavior))
}

const LADDER: readonly SimDifficulty[] = ['receptive', 'normal', 'skeptical', 'resistant', 'pressure_test']
const ENGINE_TO_LADDER: Record<Difficulty, number> = { supportive: 0, realistic: 1, resistant: 3, pressure_test: 4 }

/**
 * Next simulation settings: the physician style and difficulty where the
 * behavior actually appeared, one step harder when the rep is not getting
 * worse (and pressure_test only when they already face resistant doctors and
 * are improving). A worsening pattern repeats the same level.
 */
export function targetedSetup(w: Weakness, fallbackLang: 'en' | 'ar'): TargetedSetup {
  const target = CHALLENGE_MAP[w.pattern.behavior]
  const ctx = w.pattern.dominantContext
  const base = ctx.difficulty ? ENGINE_TO_LADDER[ctx.difficulty] : 1
  let level = base
  if (w.pattern.trend !== 'worsening') level = Math.min(base + 1, base >= 3 && w.pattern.trend === 'improving' ? 4 : 3)
  level = Math.max(1, Math.min(level, 4))
  return {
    physicianStyle: ctx.physicianStyle ?? target.defaultStyle,
    difficulty: LADDER[level],
    objectionType: ctx.objectionType ?? target.objectionType,
    language: ctx.language ?? fallbackLang,
  }
}

export function recommendNext(
  events: readonly BehaviorEvent[], sessionIdsNewestFirst: readonly string[], fallbackLang: 'en' | 'ar' = 'en',
): ChallengeRecommendation {
  const ranked = rankWeaknesses(events, sessionIdsNewestFirst)
  if (!ranked.length) return { status: 'no_pattern', sessionsConsidered: sessionIdsNewestFirst.length, sessionsNeeded: MIN_SESSIONS_FOR_PATTERN }
  const [weakness, ...rest] = ranked
  const target: ChallengeTarget = CHALLENGE_MAP[weakness.pattern.behavior]
  const targeted = targetedSetup(weakness, fallbackLang)
  return {
    status: 'recommended', weakness, alternatives: rest.slice(0, 2),
    exercise: { drillId: target.drillByStyle?.[targeted.physicianStyle] ?? target.drillId, targeted },
    changesScoringConfig: false,
  }
}

/** The unsaved scenario a targeted simulation runs from. Validated like any trainer-authored one. */
export function targetedScenario(w: Weakness, setup: TargetedSetup): SimScenario {
  const target = CHALLENGE_MAP[w.pattern.behavior]
  const res = validateSimScenario({
    name: `Targeted practice: ${w.pattern.behavior.replace(/_/g, ' ')}`,
    therapeuticArea: 'General',
    physician: { specialty: 'general_practice', seniority: 'specialist', style: setup.physicianStyle, relationshipStage: 'early', adoptionAttitude: 'cautious' },
    mainConcerns: [target.concern],
    visitPurpose: 'Targeted practice on a recurring behavior',
    learningObjectives: [target.objective],
    expectedCompetencies: [target.competency],
    difficulty: setup.difficulty, language: setup.language, arabicVariant: setup.language === 'ar' ? 'iraqi' : undefined,
    availableTimeMin: 5,
    requiredObjections: [{ type: setup.objectionType, text: null }],
    scoringCriteria: [{ behavior: w.pattern.behavior, emphasis: 'focus' }],
  })
  if (!res.ok) throw new Error(`targeted scenario invalid: ${res.errors.join('; ')}`)
  return res.value
}

export type ProgressVerdict = 'too_early' | 'less_often' | 'no_change' | 'more_often'

export interface ChallengeProgress {
  behavior: string
  targetedSessions: number
  otherSessions: number
  /** Share of sessions where the behavior occurred. */
  rateBefore: number
  rateAfter: number
  verdict: ProgressVerdict
  /** Targeted sessions are deliberately harder, so a flat rate can still be progress. */
  caveat: 'targeted_sessions_are_harder'
}

const PROGRESS_MIN_TARGETED = 2
const PROGRESS_CHANGE = 0.25

/**
 * Reassessment: how often the behavior showed up in sessions started from this
 * recommendation vs. the rest. Descriptive, with a caveat - not a verdict on the rep.
 */
export function challengeProgress(
  behavior: string, events: readonly BehaviorEvent[], sessionIds: readonly string[], targetedSessionIds: ReadonlySet<string>,
): ChallengeProgress {
  const withBehavior = new Set(events.filter(e => e.behavior === behavior && e.effect === 'hurt').map(e => e.sessionId))
  const targeted = sessionIds.filter(id => targetedSessionIds.has(id))
  const others = sessionIds.filter(id => !targetedSessionIds.has(id))
  const rate = (ids: readonly string[]) => (ids.length ? ids.filter(id => withBehavior.has(id)).length / ids.length : 0)
  const rateBefore = rate(others), rateAfter = rate(targeted)
  const verdict: ProgressVerdict = targeted.length < PROGRESS_MIN_TARGETED || others.length < PROGRESS_MIN_TARGETED ? 'too_early'
    : rateAfter <= rateBefore - PROGRESS_CHANGE ? 'less_often' : rateAfter >= rateBefore + PROGRESS_CHANGE ? 'more_often' : 'no_change'
  return { behavior, targetedSessions: targeted.length, otherSessions: others.length, rateBefore, rateAfter, verdict, caveat: 'targeted_sessions_are_harder' }
}
