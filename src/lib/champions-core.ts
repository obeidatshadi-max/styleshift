// Asia/Baghdad is UTC+3 with no daylight saving — a fixed offset is correct.
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000

/** UTC instant of the most recent Baghdad-local midnight. */
export function dailySince(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + BAGHDAD_OFFSET_MS)
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - BAGHDAD_OFFSET_MS)
}

/** UTC instant of the most recent Baghdad-local Monday 00:00. */
export function weeklySince(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + BAGHDAD_OFFSET_MS)
  const daysSinceMonday = (local.getUTCDay() + 6) % 7 // Sun=0 -> 6, Mon=1 -> 0
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - daysSinceMonday)
  return new Date(local.getTime() - BAGHDAD_OFFSET_MS)
}

export interface XpRow {
  rep_id: string
  amount: number
  created_at: string
}

/**
 * Top rep by summed XP at/after `since`. Ties broken by the earliest
 * last-contributing-event time (whoever reached the total first). Returns null
 * when no rep has a positive in-window total.
 */
export function pickChampion(rows: XpRow[], since: Date): { id: string; periodXp: number } | null {
  const sinceMs = since.getTime()
  const totals = new Map<string, { xp: number; last: number }>()
  for (const r of rows) {
    const t = new Date(r.created_at).getTime()
    if (t < sinceMs) continue
    const cur = totals.get(r.rep_id) ?? { xp: 0, last: 0 }
    cur.xp += r.amount
    cur.last = Math.max(cur.last, t)
    totals.set(r.rep_id, cur)
  }
  let best: { id: string; periodXp: number; last: number } | null = null
  for (const [id, v] of totals) {
    if (v.xp <= 0) continue
    if (!best || v.xp > best.periodXp || (v.xp === best.periodXp && v.last < best.last)) {
      best = { id, periodXp: v.xp, last: v.last }
    }
  }
  return best ? { id: best.id, periodXp: best.periodXp } : null
}
