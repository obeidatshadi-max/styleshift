import { describe, it, expect } from 'vitest'
import { BIAS_FOR_CATEGORY, biasForCategory } from './cognitive-biases'
import { OBJECTION_CATEGORIES } from './social-style'

describe('BIAS_FOR_CATEGORY', () => {
  it('maps every objection category to exactly one bias', () => {
    for (const category of OBJECTION_CATEGORIES) {
      expect(typeof BIAS_FOR_CATEGORY[category]).toBe('string')
    }
    expect(Object.keys(BIAS_FOR_CATEGORY).sort()).toEqual([...OBJECTION_CATEGORIES].sort())
  })

  it('biasForCategory reads the same map', () => {
    expect(biasForCategory('price')).toBe('anchoring_bias')
  })
})
