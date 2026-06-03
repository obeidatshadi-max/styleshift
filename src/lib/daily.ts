import { L1, L2, L3 } from '@/lib/game-data'

// Daily Challenge: one scenario per day, identical for everyone (deterministic
// from the UTC calendar day), rotating across levels 1→2→3. Selection is by
// scenario id so it is language-independent — the rep sees it in their language.
// Level 4 (the multi-step committee) is excluded; the daily is a quick single read.

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

/** The scenario everyone gets today (deterministic). */
export function dailyPick(dayNum = utcDayNumber()): DailyPick {
  const level = DAILY_LEVELS[dayNum % DAILY_LEVELS.length]
  const pool = level === 1 ? L1 : level === 2 ? L2 : L3
  const item = pool[dayNum % pool.length]
  return { level, scenarioId: item.id }
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
