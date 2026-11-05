import { describe, expect, it } from 'vitest'
import { generatePin, isMobileRepEmail, isWeakPin, mobileFromEmail } from './rep-pin'

describe('rep login email', () => {
  it('recognises the hidden mobile login and reads the number back', () => {
    expect(isMobileRepEmail('0780563731@s.styleshift.rep')).toBe(true)
    expect(isMobileRepEmail('0780563731@S.STYLESHIFT.REP')).toBe(true)
    expect(mobileFromEmail('0780563731@s.styleshift.rep')).toBe('0780563731')
  })
  it('does not treat real emails, lookalike domains or non-strings as PIN accounts', () => {
    expect(isMobileRepEmail('rep@gmail.com')).toBe(false)
    expect(isMobileRepEmail('x@s.styleshift.rep.evil.com')).toBe(false)
    expect(isMobileRepEmail(undefined)).toBe(false)
    expect(isMobileRepEmail(null)).toBe(false)
  })
})

describe('weak PINs', () => {
  it('flags repeats and straight runs, up or down', () => {
    for (const p of ['000000', '111111', '123456', '234567', '654321', '987654']) expect(isWeakPin(p)).toBe(true)
  })
  it('lets ordinary PINs through', () => {
    for (const p of ['482913', '123457', '121212', '102938']) expect(isWeakPin(p)).toBe(false)
  })
})

describe('generatePin', () => {
  const fixed = (...bytes: number[]) => (n: number) => Uint8Array.from({ length: n }, (_, i) => bytes[i % bytes.length])
  it('makes six digits', () => {
    expect(generatePin(fixed(4, 8, 2, 9, 1, 3))).toBe('482913')
  })
  it('keeps leading zeros, because a PIN is text', () => {
    expect(generatePin(fixed(0, 4, 7, 1, 9, 3))).toBe('047193')
  })
  it('skips bytes that would bias the digits, and weak results', () => {
    // 250..255 are skipped; the first run would be 111111 (weak), so it keeps going.
    let call = 0
    const random = (n: number) => { call++; return call === 1 ? Uint8Array.from({ length: n }, () => 1) : Uint8Array.from({ length: n }, (_, i) => [255, 4, 8, 2, 9, 1, 3][i % 7]) }
    const pin = generatePin(random)
    expect(pin).toMatch(/^\d{6}$/)
    expect(isWeakPin(pin)).toBe(false)
  })
  it('never returns a weak PIN or the wrong length over many draws', () => {
    for (let i = 0; i < 300; i++) {
      const pin = generatePin(n => crypto.getRandomValues(new Uint8Array(n)))
      expect(pin).toMatch(/^\d{6}$/)
      expect(isWeakPin(pin)).toBe(false)
    }
  })
  it('uses every digit', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) for (const c of generatePin(n => crypto.getRandomValues(new Uint8Array(n)))) seen.add(c)
    expect(seen.size).toBe(10)
  })
})
