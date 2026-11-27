import { describe, expect, it } from 'vitest'
import { L1, L2, L3, L4, XP_VALUES } from '@/lib/game-data'
import { L2_AR, L3_AR, L4_AR } from '@/lib/game-data-ar'
import { withShuffledOptions } from '@/lib/scenario-engine'
import { bestL4Index } from '@/lib/game-logic'
import { dailyPicks } from '@/lib/daily'
import {
  dailyShuffleKey, dailyXp, levelShuffleKey, LEVEL_QUESTION_COUNT, scoreDailyAnswer, scoreLevel,
  type GameAnswer, type GameLevel,
} from './game-scoring'

const SLOW = 5000

function rightPick(level: GameLevel, id: number, key = levelShuffleKey(level, id)): number | string {
  if (level === 1) return L1.find(s => s.id === id)!.style
  if (level === 2) return withShuffledOptions(L2.find(s => s.id === id)!, key).opts.findIndex(o => o.r === 'win')
  if (level === 3) return withShuffledOptions(L3.find(s => s.id === id)!, key).opts.findIndex(o => o.correct)
  return bestL4Index(withShuffledOptions(L4.find(s => s.id === id)!, key).opts)
}
const pool = (level: GameLevel) => (level === 1 ? L1 : level === 2 ? L2 : level === 3 ? L3 : L4)
const perfectRun = (level: GameLevel, ms = SLOW): GameAnswer[] =>
  pool(level).slice(0, LEVEL_QUESTION_COUNT[level]).map(s => ({ id: s.id, pick: rightPick(level, s.id), ms }))

describe('scoreLevel', () => {
  it.each([1, 2, 3, 4] as GameLevel[])('gives level %i a perfect score only for the right picks', level => {
    const n = LEVEL_QUESTION_COUNT[level]
    const score = scoreLevel(level, 'en', perfectRun(level))!
    expect(score.results).toEqual(Array(n).fill(true))
    expect(score.accuracy).toBe(100)
    expect(score.xp).toBe(n * XP_VALUES.correct + XP_VALUES.perfectLevel + XP_VALUES.levelComplete)
  })

  it('adds the fast bonus for quick right answers only', () => {
    const fast = scoreLevel(1, 'en', perfectRun(1, 900))!
    expect(fast.xp).toBe(6 * (XP_VALUES.correct + XP_VALUES.fastBonus) + XP_VALUES.perfectLevel + XP_VALUES.levelComplete)
  })

  it('scores wrong picks as wrong and keeps the completion XP', () => {
    const run = perfectRun(1).map(a => ({ ...a, pick: a.pick === 'driver' ? 'amiable' : 'driver' }))
    const score = scoreLevel(1, 'en', run)!
    expect(score.accuracy).toBe(0)
    expect(score.xp).toBe(XP_VALUES.levelComplete)
    expect(score.badges).toEqual([])
  })

  it('rejects runs a real game cannot produce', () => {
    const run = perfectRun(2)
    expect(scoreLevel(2, 'en', run.slice(1))).toBeNull() // too few
    expect(scoreLevel(2, 'en', [...run.slice(1), run[1]])).toBeNull() // repeated scenario
    expect(scoreLevel(2, 'en', [{ ...run[0], id: 999999 }, ...run.slice(1)])).toBeNull() // unknown scenario
    expect(scoreLevel(2, 'en', [{ ...run[0], pick: 99 }, ...run.slice(1)])).toBeNull() // no such option
    expect(scoreLevel(2, 'en', [{ ...run[0], pick: 'driver' }, ...run.slice(1)])).toBeNull() // wrong pick type
    expect(scoreLevel(1, 'en', [{ ...perfectRun(1)[0], pick: 'boss' }, ...perfectRun(1).slice(1)])).toBeNull()
  })

  it('awards the level badges by the same rules as the level screens', () => {
    expect(scoreLevel(1, 'en', perfectRun(1))!.badges).toContain('First Scan')
    expect(scoreLevel(2, 'en', perfectRun(2))!.badges).toContain('Crisis Tamer')
  })

  it('Arabic and English data mark the same option right after shuffling', () => {
    const pairs = [[L2, L2_AR, 2], [L3, L3_AR, 3], [L4, L4_AR, 4]] as const
    for (const [en, ar, level] of pairs) {
      for (const item of en) {
        const twin = (ar as readonly { id: number }[]).find(s => s.id === item.id)
        if (!twin) continue
        const enPick = rightPick(level, item.id)
        const run = perfectRun(level).map((a, i) => (i === 0 ? { id: item.id, pick: enPick, ms: SLOW } : a)).filter((a, i, all) => all.findIndex(b => b.id === a.id) === i)
        if (run.length !== LEVEL_QUESTION_COUNT[level]) continue
        expect(scoreLevel(level, 'ar', run)?.results[0], `L${level} #${item.id}`).toBe(true)
      }
    }
  })
})

describe('daily challenge', () => {
  const day = 20000
  const picks = dailyPicks(day)

  it("accepts only today's scenario and scores it", () => {
    const p2 = picks.find(p => p.level === 2)!
    const right = rightPick(2, p2.scenarioId, dailyShuffleKey(2, p2.scenarioId))
    expect(scoreDailyAnswer(2, p2.scenarioId, right, 'en', day)).toEqual({ correct: true })
    const other = L2.find(s => s.id !== p2.scenarioId)!.id
    expect(scoreDailyAnswer(2, other, 0, 'en', day)).toBeNull()
    expect(scoreDailyAnswer(4, 1, 0, 'en', day)).toBeNull()
  })

  it('gives the streak bonus only on the answer that completes the set', () => {
    expect(dailyXp(true, 1)).toEqual({ base: XP_VALUES.correct, bonus: 0 })
    expect(dailyXp(false, 3)).toEqual({ base: 0, bonus: XP_VALUES.dailyStreak })
  })
})
