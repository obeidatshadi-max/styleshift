/**
 * Server-side scoring for the practice game and the daily challenge.
 *
 * The browser used to send its own accuracy, XP and badges, and the database stored them as
 * sent. Leaderboards, the champion banner and certification all read those numbers
 * (architecture review 2026-11-27, F1). Now the browser sends only what the rep picked; this
 * module re-scores each pick against the same game data and rules the level screens use.
 *
 * Pure: no database, no browser. The level screens and the API routes share these rules.
 */
import { L1, L2, L3, L4, XP_VALUES } from '@/lib/game-data'
import { L1_AR, L2_AR, L3_AR, L4_AR } from '@/lib/game-data-ar'
import { withShuffledOptions } from '@/lib/scenario-engine'
import { bestL4Index, clamp } from '@/lib/game-logic'
import { dailyPicks, DAILY_TOTAL } from '@/lib/daily'
import type { BadgeName, StyleKey } from '@/types/game'

export type GameLang = 'en' | 'ar'
export type GameLevel = 1 | 2 | 3 | 4

/** Questions per level run. The level screens draw exactly this many. */
export const LEVEL_QUESTION_COUNT: Record<GameLevel, number> = { 1: 6, 2: 4, 3: 4, 4: 4 }

/** An answer under this many milliseconds earns the fast bonus. */
export const FAST_ANSWER_MS = 2100
/** Reaction times outside 1 ms to 60 s are not counted in the average. */
const MAX_COUNTED_MS = 60000

/** Lifetime XP that earns the Style Master badge. */
export const STYLE_MASTER_XP = 2000

const STYLE_KEYS: readonly StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']

/** One answered question. `pick` is a style key on level 1, otherwise the index of the option
 * as shown on screen (options are shuffled with a fixed seed, so the server can rebuild the order). */
export interface GameAnswer { id: number; pick: number | string; ms: number }

export interface LevelScore {
  results: boolean[]
  accuracy: number
  xp: number
  badges: BadgeName[]
  avgMs: number
  meters?: { quota: number; morale: number; risk: number }
}

export const isGameLevel = (v: unknown): v is GameLevel => v === 1 || v === 2 || v === 3 || v === 4
export const isGameLang = (v: unknown): v is GameLang => v === 'en' || v === 'ar'

function data(lang: GameLang) {
  return lang === 'ar' ? { L1: L1_AR, L2: L2_AR, L3: L3_AR, L4: L4_AR } : { L1, L2, L3, L4 }
}

/** Shuffle seed the level screens use for each level's options. */
export const levelShuffleKey = (level: GameLevel, id: number) => `L${level}-${id}`
/** Shuffle seed the daily challenge uses. */
export const dailyShuffleKey = (level: number, id: number) => `D${level}-${id}`

/** Whether one pick is right, or null when the scenario or pick does not exist. */
function judge(level: GameLevel, lang: GameLang, id: number, pick: number | string, shuffleKey: string): { ok: boolean; l4?: { quota: number; morale: number; risk: number } } | null {
  const d = data(lang)
  if (level === 1) {
    const item = d.L1.find(s => s.id === id)
    if (!item || typeof pick !== 'string' || !STYLE_KEYS.includes(pick as StyleKey)) return null
    return { ok: pick === item.style }
  }
  if (typeof pick !== 'number' || !Number.isInteger(pick) || pick < 0) return null
  if (level === 2) {
    const raw = d.L2.find(s => s.id === id)
    if (!raw) return null
    const opt = withShuffledOptions(raw, shuffleKey).opts[pick]
    return opt ? { ok: opt.r === 'win' } : null
  }
  if (level === 3) {
    const raw = d.L3.find(s => s.id === id)
    if (!raw) return null
    const opt = withShuffledOptions(raw, shuffleKey).opts[pick]
    return opt ? { ok: opt.correct } : null
  }
  const raw = d.L4.find(s => s.id === id)
  if (!raw) return null
  const item = withShuffledOptions(raw, shuffleKey)
  const opt = item.opts[pick]
  return opt ? { ok: pick === bestL4Index(item.opts), l4: { quota: opt.quota, morale: opt.morale, risk: opt.risk } } : null
}

/** Re-scores a finished level run. Returns null for anything a real run cannot produce:
 * wrong number of answers, repeated or unknown scenarios, or impossible picks. */
export function scoreLevel(level: GameLevel, lang: GameLang, answers: readonly GameAnswer[]): LevelScore | null {
  if (!Array.isArray(answers) || answers.length !== LEVEL_QUESTION_COUNT[level]) return null
  if (new Set(answers.map(a => a.id)).size !== answers.length) return null

  const results: boolean[] = []
  const badges: BadgeName[] = []
  const counted: number[] = []
  const meters = { quota: 50, morale: 60, risk: 35 }
  const l3 = data(lang).L3
  let xp = 0

  for (const a of answers) {
    if (!a || !Number.isInteger(a.id) || typeof a.ms !== 'number' || !Number.isFinite(a.ms)) return null
    const verdict = judge(level, lang, a.id, a.pick, levelShuffleKey(level, a.id))
    if (!verdict) return null
    results.push(verdict.ok)
    if (verdict.ok) {
      xp += XP_VALUES.correct
      if (a.ms > 0 && a.ms < FAST_ANSWER_MS) xp += XP_VALUES.fastBonus
      if (level === 1 && !badges.includes('First Scan')) badges.push('First Scan')
      if (level === 2 && !badges.includes('Crisis Tamer')) badges.push('Crisis Tamer')
      if (level === 3 && l3.find(s => s.id === a.id)?.multi && !badges.includes('Drive Whisperer')) badges.push('Drive Whisperer')
    }
    if (a.ms > 0 && a.ms < MAX_COUNTED_MS) counted.push(a.ms)
    if (verdict.l4) {
      meters.quota = clamp(meters.quota + verdict.l4.quota)
      meters.morale = clamp(meters.morale + verdict.l4.morale)
      meters.risk = clamp(meters.risk + verdict.l4.risk)
    }
  }

  const got = results.filter(Boolean).length
  if (got === results.length) xp += XP_VALUES.perfectLevel
  xp += XP_VALUES.levelComplete
  if (level === 4 && meters.quota >= 60 && meters.morale >= 50 && meters.risk <= 50) badges.push('Boardroom Ace')

  return {
    results, xp, badges,
    accuracy: Math.round(got / results.length * 100),
    avgMs: counted.length ? Math.round(counted.reduce((s, v) => s + v, 0) / counted.length) : 0,
    ...(level === 4 ? { meters } : {}),
  }
}

/** Scores one daily-challenge answer. Only today's scenario for that level is accepted. */
export function scoreDailyAnswer(level: number, scenarioId: number, pick: number | string, lang: GameLang, dayNum?: number): { correct: boolean } | null {
  const today = dailyPicks(dayNum).find(p => p.level === level)
  if (!today || today.scenarioId !== scenarioId || !isGameLevel(level)) return null
  const verdict = judge(level, lang, scenarioId, pick, dailyShuffleKey(level, scenarioId))
  return verdict ? { correct: verdict.ok } : null
}

/** XP for one daily answer, plus the streak bonus on the answer that completes the set. */
export function dailyXp(correct: boolean, answeredToday: number): { base: number; bonus: number } {
  return { base: correct ? XP_VALUES.correct : 0, bonus: answeredToday === DAILY_TOTAL ? XP_VALUES.dailyStreak : 0 }
}
