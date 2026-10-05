import { describe, expect, it } from 'vitest'
import { findPracticePattern, type PatternSession } from './practice-pattern'

const session = (hurts: string[], scores: Record<string, number | null> = {}): PatternSession => ({
  competencies: {
    closing: { score: scores.closing ?? null, contributions: hurts.map(behavior => ({ behavior, points: -5 })) },
    questioning: { score: scores.questioning ?? null, contributions: [{ behavior: 'open_question', points: 5 }] },
  },
})

describe('findPracticePattern', () => {
  it('needs at least three scored sessions', () => {
    expect(findPracticePattern([])).toBeNull()
    expect(findPracticePattern([session(['premature_close']), session(['premature_close']), { competencies: null }])).toBeNull()
  })
  it('names a behavior that hurt in three or more of the last five sessions', () => {
    const list = [session(['premature_close']), session([]), session(['premature_close']), session(['premature_close', 'no_next_step']), session([]), session(['premature_close'])]
    expect(findPracticePattern(list)).toEqual({ kind: 'repeated_behavior', behavior: 'premature_close', count: 3, of: 5 })
  })
  it('ignores a behavior that hurt only twice', () => {
    expect(findPracticePattern([session(['premature_close']), session(['premature_close']), session([])])).toBeNull()
  })
  it('falls back to the weakest area when it averages below 45', () => {
    const list = [session([], { closing: 30, questioning: 70 }), session([], { closing: 40, questioning: 60 }), session([], { closing: 35, questioning: 80 })]
    expect(findPracticePattern(list)).toEqual({ kind: 'weak_area', competency: 'closing', average: 35, of: 3 })
  })
  it('stays quiet when nothing stands out', () => {
    const list = [session([], { closing: 60 }), session([], { closing: 55 }), session([], { closing: 70 })]
    expect(findPracticePattern(list)).toBeNull()
  })
})
