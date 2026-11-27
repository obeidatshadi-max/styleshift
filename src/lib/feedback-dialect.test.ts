import { describe, expect, it } from 'vitest'
import { feedbackDialectRule, IRAQI_FEEDBACK_RULE, parseFeedbackDialect } from './feedback-dialect'

describe('feedback dialect', () => {
  it('defaults anything but "iraqi" to standard Arabic', () => {
    expect(parseFeedbackDialect('iraqi')).toBe('iraqi')
    for (const v of [undefined, null, '', 'msa', 'IRAQI', 'gulf', 1]) expect(parseFeedbackDialect(v)).toBe('msa')
  })

  it('adds the Iraqi rule only for Arabic feedback with Iraqi chosen', () => {
    expect(feedbackDialectRule('ar', 'iraqi')).toContain(IRAQI_FEEDBACK_RULE)
    expect(feedbackDialectRule('ar', 'msa')).toBe('')
    expect(feedbackDialectRule('en', 'iraqi')).toBe('')
  })

  it('keeps JSON keys in English and overrides the standard-Arabic instruction', () => {
    expect(IRAQI_FEEDBACK_RULE).toMatch(/JSON keys/)
    expect(IRAQI_FEEDBACK_RULE).toMatch(/replaces any earlier instruction/)
  })
})
