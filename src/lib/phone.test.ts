import { describe, it, expect } from 'vitest'
import { toE164Iraq } from './phone'

describe('toE164Iraq', () => {
  it('converts a local Iraqi number with leading 0', () => {
    expect(toE164Iraq('07701234567')).toBe('+9647701234567')
  })

  it('converts a local number with separators', () => {
    expect(toE164Iraq('0770 123 4567')).toBe('+9647701234567')
    expect(toE164Iraq('(0770) 123-4567')).toBe('+9647701234567')
  })

  it('accepts an already-E.164 number', () => {
    expect(toE164Iraq('+9647701234567')).toBe('+9647701234567')
  })

  it('converts a 00-prefixed international number', () => {
    expect(toE164Iraq('009647701234567')).toBe('+9647701234567')
  })

  it('accepts a bare 964-prefixed number with no plus', () => {
    expect(toE164Iraq('9647701234567')).toBe('+9647701234567')
  })

  it('accepts a bare local number with the leading 0 already stripped', () => {
    expect(toE164Iraq('7701234567')).toBe('+9647701234567')
  })

  it('rejects garbage input', () => {
    expect(toE164Iraq('abc')).toBeNull()
    expect(toE164Iraq('123')).toBeNull()
    expect(toE164Iraq('')).toBeNull()
  })
})
