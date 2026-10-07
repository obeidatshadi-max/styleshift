import { describe, it, expect } from 'vitest'
import { findUnanchoredComparatives } from './comparatives'
import { comparativeMeasurements } from '@/agents/behaviorAnalyst/prompt'
import { createEmptySession } from '@/schemas/session/factory'

describe('findUnanchoredComparatives', () => {
  it('flags comparative claims that name no comparison', () => {
    const r = findUnanchoredComparatives("It's better tolerated and the most effective option for them.")
    expect(r.markers).toEqual(['better tolerated', 'most effective'])
  })
  it('does not flag a comparison that is anchored later in the sentence', () => {
    expect(findUnanchoredComparatives('It was better tolerated than placebo in the trial.').count).toBe(0)
    expect(findUnanchoredComparatives('Fewer side effects compared with the older class.').count).toBe(0)
    expect(findUnanchoredComparatives('It is safer versus the standard option.').count).toBe(0)
  })
  it('judges each sentence on its own', () => {
    const r = findUnanchoredComparatives('It is safer than the old one. And it is cheaper.')
    expect(r.markers).toEqual(['cheaper'])
  })
  it('does not treat a question as a claim', () => {
    expect(findUnanchoredComparatives('Which would be better for your elderly patients?').count).toBe(0)
  })
  it('ignores everyday idioms', () => {
    expect(findUnanchoredComparatives("I'll do my best to bring the data. Best regards.").count).toBe(0)
    expect(findUnanchoredComparatives("I'd better check that and come back to you.").count).toBe(0)
  })
  it('matches whole words only', () => {
    expect(findUnanchoredComparatives('The bestseller list and a betterment fund.').count).toBe(0)
  })
  it('returns nothing for plain speech', () => {
    expect(findUnanchoredComparatives('The trial data show a reduction in admissions.').count).toBe(0)
  })
})

describe('comparativeMeasurements (analyst hint)', () => {
  it('lists only rep turns with an unanchored comparative', () => {
    const s = createEmptySession('s1', 'r1')
    s.transcript = [
      { turnIndex: 0, role: 'doctor', text: 'The old drug is better.' },
      { turnIndex: 1, role: 'rep', text: 'Ours is safer and better tolerated.' },
      { turnIndex: 2, role: 'rep', text: 'It is safer than the older class.' },
    ] as typeof s.transcript
    const hint = comparativeMeasurements(s)
    expect(hint).toContain('turn 1: safer, better tolerated')
    expect(hint).not.toContain('turn 0')
    expect(hint).not.toContain('turn 2')
  })
  it('is empty when nothing is flagged', () => {
    const s = createEmptySession('s1', 'r1')
    s.transcript = [{ turnIndex: 0, role: 'rep', text: 'What do your patients struggle with?' }] as typeof s.transcript
    expect(comparativeMeasurements(s)).toBe('')
  })
})
