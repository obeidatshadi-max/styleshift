// Fixes from the 2026-11-22 rep walkthrough of the live app.
import { describe, expect, it } from 'vitest'
import { withShuffledOptions } from '@/lib/scenario-engine'
import { L2, L3, L4 } from '@/lib/game-data'
import { L2_AR } from '@/lib/game-data-ar'
import { meetsGoal } from '@/lib/roleplay-briefing'
import { stripSegmentRefs } from '@/lib/report/groundReport'
import { adaptAgentSession } from '@/lib/report/adapters/fromAgentSession'
import { createEmptySession } from '@/schemas/session/factory'
import type { SessionRecord } from '@/agents/orchestrator/types'

describe('game answers are not always first', () => {
  it('moves the best answer away from first place for many items across salts', () => {
    let notFirst = 0, total = 0
    for (let salt = 1; salt <= 20; salt++) {
      for (const item of [...L2, ...L3]) {
        const shuffled = withShuffledOptions(item, `k-${item.id}`, salt)
        const best = shuffled.opts.findIndex(o => ('r' in o ? o.r === 'win' : (o as { correct: boolean }).correct))
        total++; if (best !== 0) notFirst++
      }
    }
    // With 3 options a fair shuffle puts the best one first about a third of the time.
    expect(notFirst / total).toBeGreaterThan(0.55)
    expect(notFirst / total).toBeLessThan(0.8)
  })
  it('keeps the same options and the same order within a session, and in both languages', () => {
    const en = L2[0], ar = L2_AR.find(s => s.id === en.id)!
    const a = withShuffledOptions(en, 'L2-x', 7), b = withShuffledOptions(en, 'L2-x', 7), c = withShuffledOptions(ar, 'L2-x', 7)
    expect(a.opts.map(o => o.r)).toEqual(b.opts.map(o => o.r))
    expect(c.opts.map(o => o.r)).toEqual(a.opts.map(o => o.r))
    expect([...a.opts].map(o => o.t).sort()).toEqual([...en.opts].map(o => o.t).sort())
  })
  it('also shuffles level 4', () => {
    const orders = new Set(Array.from({ length: 10 }, (_, s) => withShuffledOptions(L4[0], 'L4', s + 1).opts.map(o => o.t).join('|')))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('roleplay talk time is a band, not a ceiling', () => {
  it('1% is not on goal; about half is; too much is not', () => {
    expect(meetsGoal('talkRatio', 1)).toBe(false)
    expect(meetsGoal('talkRatio', 45)).toBe(true)
    expect(meetsGoal('talkRatio', 80)).toBe(false)
  })
})

describe('report wording', () => {
  it('removes "segment N" written in words', () => {
    expect(stripSegmentRefs('In segment 7, you asked the doctor to agree.')).toBe('You asked the doctor to agree.')
    expect(stripSegmentRefs('You restated the concern in segment 3, and the doctor agreed.')).toBe('You restated the concern and the doctor agreed.')
    expect(stripSegmentRefs('You linked it (segments 2 and 5) to adherence.')).toBe('You linked it to adherence.')
    expect(stripSegmentRefs('Compare vs. placebo.')).toBe('Compare vs. placebo.')
  })
})

describe('visit plan reaches the AI Doctor report', () => {
  const record = (): SessionRecord => {
    const session = createEmptySession('s1', 'r1')
    session.transcript = [{ turnIndex: 0, role: 'doctor', text: 'Hello.', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }] as typeof session.transcript
    return { session, phase: 'reported', trace: [], report: null }
  }
  it('uses the saved plan as the objective', () => {
    expect(adaptAgentSession(record(), { objective: 'Start 3 patients', successMeasure: 'He names the patient type' }).context.objective)
      .toBe('Start 3 patients (success: He names the patient type)')
  })
  it('falls back when there is no plan', () => {
    expect(adaptAgentSession(record(), null).context.objective).toBeNull()
    expect(adaptAgentSession(record(), { objective: '  ', successMeasure: 'x' }).context.objective).toBeNull()
  })
})

describe('level result and home', () => {
  it('has a lesson for every level and the new result labels in both languages', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/i18n.tsx', 'utf8')
    for (const k of ['result.complete', 'result.nextOpen', 'result.allDone', 'result.lessonLabel', 'result.lesson.1', 'result.lesson.2', 'result.lesson.3', 'result.lesson.4', 'result.confidenceHint', 'sps.viewProfile'])
      expect(src.split(`'${k}':`).length - 1, k).toBe(2)
  })
})
