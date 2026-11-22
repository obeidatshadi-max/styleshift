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

// One random salt per page load: answer order changes every session, but stays the same while the rep
// plays (and when they switch language mid-level, since EN and AR options share the same order).
const ORDER_SALT = Math.floor(Math.random() * 0x7fffffff)

/** Deterministic Fisher-Yates driven by a small seeded generator (mulberry32). */
function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** The scenario with its answer options in a session-random order. The content files list the best answer
 * first, so without this a rep could pass every level by always choosing the first option. */
export function withShuffledOptions<T extends { opts: readonly unknown[] }>(item: T, key: string | number, salt = ORDER_SALT): T {
  let h = salt
  for (const ch of String(key)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return { ...item, opts: seededShuffle(item.opts, h) }
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
