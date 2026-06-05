import { L1, L2, L3 } from '@/lib/game-data'

// Daily Challenge: three scenarios per day — one from each of levels 1, 2 and 3,
// identical for everyone (deterministic from the UTC calendar day). Selection is
// by scenario id so it is language-independent — the rep sees it in their
// language. Level 4 (the multi-step committee) is excluded; the daily stays a
// quick set of three single reads. A day only "counts" once all three are done.

const DAILY_LEVELS = [1, 2, 3] as const

/** Integer index of the UTC calendar day. */
export function utcDayNumber(date = new Date()): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000)
}

/** Today's date as a UTC YYYY-MM-DD key (matches the stored challenge_date). */
export function todayKey(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10)
}

export interface DailyPick { level: number; scenarioId: number }

/** The three scenarios everyone gets today — one per level (deterministic). */
export function dailyPicks(dayNum = utcDayNumber()): DailyPick[] {
  return DAILY_LEVELS.map(level => {
    const pool = level === 1 ? L1 : level === 2 ? L2 : L3
    return { level, scenarioId: pool[dayNum % pool.length].id }
  })
}

/** The total number of questions in a daily set. */
export const DAILY_TOTAL = DAILY_LEVELS.length

/** True once a rep has answered every level in today's daily set. */
export function isDayComplete(levelsDone: Set<number>): boolean {
  return DAILY_LEVELS.every(l => levelsDone.has(l))
}

/**
 * Current consecutive-day streak from a set of YYYY-MM-DD keys.
 * The streak is preserved through today: if today isn't played yet but
 * yesterday was, it still counts (it only breaks once a full day is missed).
 */
export function computeStreak(dates: Set<string>, today = new Date()): number {
  let streak = 0
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (!dates.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1)
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return streak
}
