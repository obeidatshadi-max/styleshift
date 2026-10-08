import { describe, it, expect } from 'vitest'
import { isReportSessionType, isCertainty, isCommitmentStatus, isSocialStyle } from './index'

describe('conversationReport guards', () => {
  it('accepts only the four known session types', () => {
    expect(isReportSessionType('human_partner')).toBe(true)
    expect(isReportSessionType('customer_visit')).toBe(true)
    expect(isReportSessionType('made_up')).toBe(false)
  })
  it('accepts only the three certainty labels', () => {
    expect(isCertainty('stated')).toBe(true)
    expect(isCertainty('guessed')).toBe(false)
  })
  it('accepts only the three commitment statuses', () => {
    expect(isCommitmentStatus('agreed')).toBe(true)
    expect(isCommitmentStatus('done')).toBe(false)
  })
  it('accepts only the four social styles', () => {
    expect(isSocialStyle('driver')).toBe(true)
    expect(isSocialStyle('dominant')).toBe(false)
  })
})
