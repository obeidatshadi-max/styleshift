import { describe, it, expect } from 'vitest'
import { SOCIAL_STYLES } from '@/schemas/conversationReport'
import { compareSelfToObserved } from './self-vs-observed'

describe('compareSelfToObserved', () => {
  it('is a match only when the styles are the same', () => {
    for (const s of SOCIAL_STYLES) expect(compareSelfToObserved(s, s)).toBe('match')
  })

  it('differs for every other pair', () => {
    for (const a of SOCIAL_STYLES) for (const b of SOCIAL_STYLES) {
      if (a !== b) expect(compareSelfToObserved(a, b)).toBe('differs')
    }
  })

  it('has nothing to compare when the report found no style', () => {
    for (const s of SOCIAL_STYLES) expect(compareSelfToObserved(s, null)).toBe('no_observation')
  })
})
