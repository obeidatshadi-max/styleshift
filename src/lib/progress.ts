import type { StyleKey } from '@/types/game'
import type { StyleShiftSession } from '@/schemas/session'
import type { DrillAttempt } from '@/schemas/drill'
import type { CapabilityReport } from '@/lib/capability-iq'
import { eventsFromSession } from '@/lib/pattern-events'
import { CHALLENGE_MAP } from '@/lib/challenge-map'
import { CAPABILITY_DIMENSIONS, type CapabilityDimension } from '@/scoring/capability'

/**
 * Professional progress, derived from practice the rep already did. Nothing is
 * awarded or stored: there are no points, levels to grind or badges to collect.
 * The design rule is that volume cannot move anything:
 *   - the week target counts DAYS with real practice, so ten sessions in a day count once
 *   - a "real" session reached a scored result with at least a few rep turns
 *   - a "real" drill attempt was assessed; repeated attempts the same day count as one (best of the day)
 *   - improvement and mastery are read from per-day bests across several days, not from the raw count
 */
export const PROGRESS_RULES = {
  /** Distinct practice days per week that meet the weekly target. */
  weeklyTargetDays: 3,
  /** A session needs at least this many rep turns to count. */
  minRepTurns: 3,
  /** Mastery needs this many days with a passed attempt, the latest of them all passed with this mean. */
  masteredDays: 3,
  masteredMean: 80,
  proficientDays: 2,
  proficientBest: 70,
  /** Improvement window, minimum distinct days and minimum span. */
  improvementWindowDays: 28,
  improvementMinDays: 3,
  improvementMinSpanDays: 14,
  /** Change (percent of the earlier mean) that counts as improved or declined. */
  improvementThreshold: 10,
  /** Reported percentages are rounded to this step. */
  percentStep: 5,
  /** A style personal best needs this many real sessions with that style. */
  styleBestMinSessions: 3,
  /** A clean run needs this many sessions without the behavior, after it hurt in at least this many earlier ones. */
  cleanRunLength: 3,
  cleanRunEarlierHurt: 2,
} as const

const DAY_MS = 86_400_000
const round = (n: number, step: number) => Math.round(n / step) * step

export type Mastery = 'new' | 'practising' | 'proficient' | 'mastered'

export interface DrillProgress {
  type: string
  best: number | null
  bestOn: string | null
  assessedDays: number
  passedDays: number
  mastery: Mastery
  improvement: { percent: number; direction: 'improved' | 'steady' | 'declined'; overDays: number } | null
}

export type MilestoneId = 'first_session' | 'first_drill_passed' | 'sessions_10' | 'streak_3_weeks' | 'streak_8_weeks' | 'drill_mastered'
export interface Milestone { id: MilestoneId; param: string | null }

export interface ProgressReport {
  week: { startsOn: string; days: number; target: number; met: boolean }
  streak: { weeks: number; bestWeeks: number }
  totals: { sessions: number; practiceDays: number; drillsPassedDays: number }
  drills: DrillProgress[]
  styleBests: Array<{ style: StyleKey; sessions: number; best: number; on: string }>
  cleanRuns: Array<{ behavior: string; sessions: number }>
  improvingCapabilities: CapabilityDimension[]
  milestones: Milestone[]
}

export interface ProgressInput {
  sessions: readonly StyleShiftSession[]
  attempts: readonly DrillAttempt[]
  /** drill id -> drill type, from the registry. */
  drillTypeOf: (drillId: string) => string | undefined
  capability?: CapabilityReport | null
  now: Date
  /** Minutes east of UTC for the rep's local day boundaries (clamped). */
  tzOffsetMin?: number
}

/** A scored simulation the rep actually engaged with. */
export function isRealSession(s: StyleShiftSession): boolean {
  return !!s.endedAt && !!s.scores && s.scores.coverage > 0 && s.transcript.filter(t => t.role === 'rep').length >= PROGRESS_RULES.minRepTurns
}

export function progressReport(input: ProgressInput): ProgressReport {
  const offset = Math.max(-840, Math.min(840, input.tzOffsetMin ?? 0)) * 60_000
  const day = (iso: string) => Math.floor((Date.parse(iso) + offset) / DAY_MS)
  const dayLabel = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10)
  // Monday-based weeks, in the rep's local time. Day 0 (1970-01-01) was a Thursday.
  const weekOf = (d: number) => Math.floor((d + 3) / 7)
  const today = Math.floor((input.now.getTime() + offset) / DAY_MS)

  const real = input.sessions.filter(isRealSession)
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!)) // newest first
  const assessed = input.attempts.filter(a => a.score !== null)

  // ── Practice days: any real session or assessed attempt, each day once ──
  const practiceDays = new Set<number>([...real.map(s => day(s.endedAt!)), ...assessed.map(a => day(a.at))])
  const daysByWeek = new Map<number, number>()
  for (const d of practiceDays) daysByWeek.set(weekOf(d), (daysByWeek.get(weekOf(d)) ?? 0) + 1)

  const target = PROGRESS_RULES.weeklyTargetDays
  const thisWeek = weekOf(today)
  const metWeeks = new Set([...daysByWeek].filter(([, n]) => n >= target).map(([w]) => w))
  // The current week never breaks a streak before it ends; it adds to it once the target is met.
  let weeks = 0
  for (let w = metWeeks.has(thisWeek) ? thisWeek : thisWeek - 1; metWeeks.has(w); w--) weeks++
  let bestWeeks = 0, run = 0
  const ordered = [...metWeeks].sort((a, b) => a - b)
  ordered.forEach((w, i) => { run = i > 0 && ordered[i - 1] === w - 1 ? run + 1 : 1; bestWeeks = Math.max(bestWeeks, run) })

  // ── Drills: per-day bests, mastery, improvement ──
  const byType = new Map<string, DrillAttempt[]>()
  for (const a of assessed) {
    const type = input.drillTypeOf(a.drillId)
    if (type) byType.set(type, [...(byType.get(type) ?? []), a])
  }
  const drills: DrillProgress[] = [...byType].map(([type, attempts]) => {
    const perDay = new Map<number, { best: number; passed: boolean; at: string }>()
    for (const a of attempts) {
      const d = day(a.at), cur = perDay.get(d)
      if (!cur || (a.score as number) > cur.best) perDay.set(d, { best: a.score as number, passed: (cur?.passed ?? false) || a.passed, at: a.at })
      else if (a.passed) cur.passed = true
    }
    const days = [...perDay].sort((a, b) => a[0] - b[0])
    const passedDays = days.filter(([, v]) => v.passed).length
    const best = days.reduce((m, [, v]) => Math.max(m, v.best), -1)
    const bestDay = days.find(([, v]) => v.best === best)
    const lastThree = days.slice(-PROGRESS_RULES.masteredDays)
    const mastery: Mastery =
      passedDays >= PROGRESS_RULES.masteredDays && lastThree.length === PROGRESS_RULES.masteredDays && lastThree.every(([, v]) => v.passed) &&
        lastThree.reduce((s, [, v]) => s + v.best, 0) / lastThree.length >= PROGRESS_RULES.masteredMean ? 'mastered'
      : passedDays >= PROGRESS_RULES.proficientDays && best >= PROGRESS_RULES.proficientBest ? 'proficient' : 'practising'

    const recent = days.filter(([d]) => today - d <= PROGRESS_RULES.improvementWindowDays)
    let improvement: DrillProgress['improvement'] = null
    if (recent.length >= PROGRESS_RULES.improvementMinDays && recent[recent.length - 1][0] - recent[0][0] >= PROGRESS_RULES.improvementMinSpanDays) {
      const half = Math.floor(recent.length / 2)
      const mean = (xs: typeof recent) => xs.reduce((s, [, v]) => s + v.best, 0) / xs.length
      const earlier = mean(recent.slice(0, half)), later = mean(recent.slice(half))
      if (earlier > 0) {
        const pct = ((later - earlier) / earlier) * 100
        improvement = {
          percent: Math.abs(round(pct, PROGRESS_RULES.percentStep)),
          direction: pct >= PROGRESS_RULES.improvementThreshold ? 'improved' : pct <= -PROGRESS_RULES.improvementThreshold ? 'declined' : 'steady',
          overDays: recent[recent.length - 1][0] - recent[0][0],
        }
      }
    }
    return { type, best: best >= 0 ? best : null, bestOn: bestDay ? dayLabel(bestDay[0]) : null, assessedDays: days.length, passedDays, mastery, improvement }
  }).sort((a, b) => a.type.localeCompare(b.type))

  // ── Personal best by physician style (current bests only) ──
  const byStyle = new Map<StyleKey, StyleShiftSession[]>()
  for (const s of real) { const k = s.socialStyle.dominant; if (k && s.scores?.overall != null) byStyle.set(k, [...(byStyle.get(k) ?? []), s]) }
  const styleBests: ProgressReport['styleBests'] = []
  for (const [style, list] of byStyle) { // list is newest first
    if (list.length < PROGRESS_RULES.styleBestMinSessions) continue
    const top = Math.max(...list.map(s => s.scores!.overall as number))
    const latestTwo = list.slice(0, 2)
    const current = latestTwo.find(s => (s.scores!.overall as number) === top)
    // A best that was set earlier and never matched since is history, not news.
    if (current && list.filter(s => (s.scores!.overall as number) === top).length === 1) {
      styleBests.push({ style, sessions: list.length, best: round(top, PROGRESS_RULES.percentStep), on: dayLabel(day(current.endedAt!)) })
    }
  }

  // ── Clean runs on behaviors that used to hurt ──
  const hurtIn = real.map(s => new Set(eventsFromSession(s).filter(e => e.effect === 'hurt').map(e => e.behavior)))
  const cleanRuns: ProgressReport['cleanRuns'] = []
  for (const behavior of Object.keys(CHALLENGE_MAP)) {
    let n = 0
    while (n < hurtIn.length && !hurtIn[n].has(behavior)) n++
    const earlierHurt = hurtIn.slice(n).filter(h => h.has(behavior)).length
    if (n >= PROGRESS_RULES.cleanRunLength && earlierHurt >= PROGRESS_RULES.cleanRunEarlierHurt) cleanRuns.push({ behavior, sessions: n })
  }
  cleanRuns.sort((a, b) => b.sessions - a.sessions || a.behavior.localeCompare(b.behavior))

  const improvingCapabilities = input.capability
    ? CAPABILITY_DIMENSIONS.filter(d => { const r = input.capability!.dimensions[d]; return r.status === 'scored' && r.trend === 'improving' })
    : []

  const passedDaysTotal = new Set(assessed.filter(a => a.passed).map(a => `${a.drillId}|${day(a.at)}`)).size
  const milestones: Milestone[] = []
  if (real.length >= 1) milestones.push({ id: 'first_session', param: null })
  if (passedDaysTotal >= 1) milestones.push({ id: 'first_drill_passed', param: null })
  if (real.length >= 10) milestones.push({ id: 'sessions_10', param: null })
  if (bestWeeks >= 3) milestones.push({ id: 'streak_3_weeks', param: null })
  if (bestWeeks >= 8) milestones.push({ id: 'streak_8_weeks', param: null })
  for (const d of drills.filter(x => x.mastery === 'mastered')) milestones.push({ id: 'drill_mastered', param: d.type })

  return {
    week: { startsOn: dayLabel(thisWeek * 7 - 3), days: daysByWeek.get(thisWeek) ?? 0, target, met: metWeeks.has(thisWeek) },
    streak: { weeks, bestWeeks },
    totals: { sessions: real.length, practiceDays: practiceDays.size, drillsPassedDays: passedDaysTotal },
    drills, styleBests, cleanRuns: cleanRuns.slice(0, 3), improvingCapabilities, milestones,
  }
}
