import { describe, it, expect } from 'vitest'
import { createEmptySession } from './factory'

describe('createEmptySession', () => {
  it('builds a valid empty session with even style weights summing to 1', () => {
    const s = createEmptySession('s1', 'r1')
    expect(s.sessionId).toBe('s1')
    expect(s.rep.repId).toBe('r1')
    expect(s.difficulty).toBe('realistic')
    const w = s.socialStyle.weights
    expect(w.driver + w.expressive + w.amiable + w.analytical).toBeCloseTo(1)
    expect(s.transcript).toEqual([])
    expect(s.scores).toBeNull()
  })
})
