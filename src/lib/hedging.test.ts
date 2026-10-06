import { describe, it, expect } from 'vitest'
import { countHedges } from './hedging'
import { analyzeRepTurn } from '@/agents/doctor/behavior'
import { hedgeMeasurements } from '@/agents/behaviorAnalyst/prompt'
import { createEmptySession } from '@/schemas/session/factory'
import { defaultScoringConfig } from '@/scoring/config'

describe('countHedges', () => {
  it('counts hedges, fillers and intensifiers in English', () => {
    const r = countHedges("Um, I guess it's sort of really good, you know?")
    expect(r.count).toBe(5)
    expect(r.markers).toEqual(expect.arrayContaining(['um', 'i guess', 'sort of', 'really', 'you know']))
  })
  it('does not count plain confident speech or respectful address', () => {
    expect(countHedges('Doctor, sir, the trial data show a clear reduction in admissions.').count).toBe(0)
  })
  it('matches whole words only', () => {
    expect(countHedges('The summary was a very short hum of numbers, bummer.').count).toBe(1) // only "very"
    expect(countHedges('Perhapsthing').count).toBe(0)
  })
  it('counts nothing in Arabic until a reviewed list is supplied', () => {
    expect(countHedges('يمكن يعني شوية مو متأكد').count).toBe(0)
  })
  it('flows into the turn shape as a measurement only', () => {
    expect(analyzeRepTurn('Maybe, sort of, I guess so.').hedgeCount).toBe(3)
    expect(analyzeRepTurn('Our data show a clear reduction.').hedgeCount).toBe(0)
  })
})

describe('hedge scoring + analyst hint', () => {
  it('registers hedged_delivery as a negative proposed behavior', () => {
    const rule = defaultScoringConfig.competencies.value_communication.behaviors.hedged_delivery
    expect(rule.points).toBeLessThan(0)
    expect(rule.source).toBe('proposed')
  })
  it('only mentions rep turns with 2+ markers', () => {
    const s = createEmptySession('s1', 'r1')
    s.transcript = [
      { turnIndex: 0, role: 'doctor', text: 'Maybe maybe maybe really.' },
      { turnIndex: 1, role: 'rep', text: 'Maybe, I guess it works.' },
      { turnIndex: 2, role: 'rep', text: 'It works.' },
    ] as typeof s.transcript
    const hint = hedgeMeasurements(s)
    expect(hint).toContain('turn 1: 2 markers')
    expect(hint).not.toContain('turn 0')
    expect(hint).not.toContain('turn 2')
  })
})
