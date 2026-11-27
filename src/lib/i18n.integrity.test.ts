import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The dictionaries are module-private, so read the source. Arabic written through a
// non-UTF-8 path silently becomes literal "?" characters (a shipped tab label once did).
// English lives in i18n.tsx; Arabic is split into i18n-ar.ts so it loads only for Arabic users.
const source = readFileSync('src/lib/i18n.tsx', 'utf8')
const arSource = readFileSync('src/lib/i18n-ar.ts', 'utf8')
const enStart = source.indexOf('const EN: Dict = {')
const enEnd = source.indexOf('\n}\n', enStart)
const arStart = arSource.indexOf('const AR: Dict = {')
const arEnd = arSource.indexOf('export default AR')

function entries(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of block.split(/\r?\n/)) {
    const m = /^\s*(['"])([^'"]+)\1:\s*(.*)$/.exec(line)
    if (m) out.set(m[2], m[3])
  }
  return out
}
const en = entries(source.slice(enStart, enEnd))
const ar = entries(arSource.slice(arStart, arEnd))

describe('i18n dictionaries', () => {
  it('found both dictionaries', () => {
    expect(en.size).toBeGreaterThan(100)
    expect(ar.size).toBeGreaterThan(100)
  })
  it('has no Arabic value corrupted into question marks', () => {
    const corrupted = [...ar].filter(([, value]) => /['"`]\s*\?{2,}/.test(value) || /\?{3,}/.test(value)).map(([key]) => key)
    expect(corrupted).toEqual([])
  })
  it('has the same keys in English and Arabic', () => {
    expect([...en.keys()].filter(key => !ar.has(key))).toEqual([])
    expect([...ar.keys()].filter(key => !en.has(key))).toEqual([])
  })
})
