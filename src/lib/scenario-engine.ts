// Scenario selection engine.
//
// Each level draws a fresh random subset from a larger pool every session so the
// game can't be memorized. We prefer scenarios the rep hasn't seen yet (tracked
// per device in localStorage) and, for the style-identification level, spread the
// picks across the four social styles. When the whole pool has been seen, the
// "seen" set recycles so content stays fresh forever.

interface HasId { id: number }
interface MaybeStyled { style?: string }

const SEEN_PREFIX = 'styleshift_seen_L'

/** Non-mutating Fisher-Yates shuffle. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function getSeen(level: number): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SEEN_PREFIX + level)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

function saveSeen(level: number, ids: number[], poolSize: number) {
  if (typeof window === 'undefined') return
  let seen = [...new Set([...getSeen(level), ...ids])]
  // Once (almost) the whole pool is exhausted, recycle: keep only this session's
  // picks as the "recent" set so the next session feels fresh but doesn't repeat
  // what was just played.
  if (seen.length >= poolSize) seen = [...ids]
  try {
    localStorage.setItem(SEEN_PREFIX + level, JSON.stringify(seen))
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Pick `count` scenarios from `pool` for the given level.
 * Unseen scenarios are preferred; `balanceStyle` spreads picks across styles.
 * Records the picks as "seen" so future sessions avoid them.
 */
export function pickScenarios<T extends HasId & MaybeStyled>(
  pool: readonly T[],
  count: number,
  level: number,
  opts?: { balanceStyle?: boolean }
): T[] {
  const seen = getSeen(level)
  const unseen = pool.filter(s => !seen.includes(s.id))
  const seenPool = pool.filter(s => seen.includes(s.id))
  // Unseen first (shuffled), then already-seen as fallback to reach `count`.
  const ordered = [...shuffle(unseen), ...shuffle(seenPool)]

  const picked = opts?.balanceStyle ? balancedPick(ordered, count) : ordered.slice(0, count)
  saveSeen(level, picked.map(p => p.id), pool.length)
  return picked
}

/** Greedily spread picks across the four styles, then fill any shortfall. */
function balancedPick<T extends HasId & MaybeStyled>(ordered: T[], count: number): T[] {
  const picked: T[] = []
  const used = new Set<number>()
  const perStyle: Record<string, number> = {}
  const maxPerStyle = Math.ceil(count / 4)

  for (const s of ordered) {
    if (picked.length >= count) break
    const key = s.style ?? 'none'
    if ((perStyle[key] ?? 0) >= maxPerStyle) continue
    picked.push(s); used.add(s.id); perStyle[key] = (perStyle[key] ?? 0) + 1
  }
  // If the per-style cap left us short (small/unbalanced pool), fill the rest.
  if (picked.length < count) {
    for (const s of ordered) {
      if (picked.length >= count) break
      if (used.has(s.id)) continue
      picked.push(s); used.add(s.id)
    }
  }
  return picked
}
