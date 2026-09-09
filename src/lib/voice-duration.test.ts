import { describe, it, expect } from 'vitest'
import { isConciseDuration, CONCISE_DURATION_BAND } from './voice-duration'

describe('isConciseDuration', () => {
  it('accepts the band edges', () => {
    expect(isConciseDuration(CONCISE_DURATION_BAND[0])).toBe(true)
    expect(isConciseDuration(CONCISE_DURATION_BAND[1])).toBe(true)
  })

  it('accepts a value inside the band', () => {
    expect(isConciseDuration(40)).toBe(true)
  })

  it('rejects too short', () => {
    expect(isConciseDuration(10)).toBe(false)
  })

  it('rejects too long', () => {
    expect(isConciseDuration(90)).toBe(false)
  })
})
