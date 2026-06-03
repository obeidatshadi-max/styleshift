import type { Rank } from '@/types/game'
import { RANKS } from './game-data'

export function getRank(xp: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXp) return RANKS[i]
  }
  return RANKS[0]
}

export function getNextRank(xp: number): Rank | null {
  for (const rank of RANKS) {
    if (rank.minXp > xp) return rank
  }
  return null
}

export function calcXpPct(xp: number): number {
  const rank = getRank(xp)
  const next = getNextRank(xp)
  if (!next) return 100
  return Math.round((xp - rank.minXp) / (next.minXp - rank.minXp) * 100)
}

export function bestL4Index(opts: { quota: number; morale: number; risk: number }[]): number {
  let bi = 0, bs = -1e9
  opts.forEach((o, i) => {
    const sc = o.quota + o.morale - o.risk
    if (sc > bs) { bs = sc; bi = i }
  })
  return bi
}

export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v))
}

export function sign(v: number): string {
  return (v >= 0 ? '+' : '') + v
}
