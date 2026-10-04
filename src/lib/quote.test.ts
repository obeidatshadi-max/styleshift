import { describe, expect, it } from 'vitest'
import { quoted } from './quote'

describe('quoted', () => {
  it('wraps plain text in the language\'s own quotation marks', () => {
    expect(quoted('Two routes to your target', 'en')).toBe('“Two routes to your target”')
    expect(quoted('مساران لتحقيق هدفك', 'ar')).toBe('«مساران لتحقيق هدفك»')
  })
  it('does not double the marks when the text already carries them', () => {
    expect(quoted('«مساران لتحقيق هدفك، مع الأرقام — القرار لك.»', 'ar')).toBe('«مساران لتحقيق هدفك، مع الأرقام — القرار لك.»')
    expect(quoted('“Two routes”', 'en')).toBe('“Two routes”')
    expect(quoted('"Two routes"', 'en')).toBe('“Two routes”')
    expect(quoted('“«نص»”', 'ar')).toBe('«نص»')
  })
  it('keeps quotation marks inside the text and trims stray spaces', () => {
    expect(quoted('  He said “no” twice  ', 'en')).toBe('“He said “no” twice”')
    expect(quoted(' قال «لا» مرتين ', 'ar')).toBe('«قال «لا» مرتين»')
  })
})
