import { describe, expect, it } from 'vitest'
import { defaultScoringConfig, behaviorIndex } from '@/scoring/config'
import { FIXTURES, ARABIC_FIXTURES, toSession } from './index'

const catalog = behaviorIndex(defaultScoringConfig)

describe('benchmark fixtures', () => {
  it('has 60 unique ids, 20 per language group', () => {
    expect(FIXTURES).toHaveLength(60)
    expect(new Set(FIXTURES.map(f => f.id)).size).toBe(60)
    for (const mix of ['en', 'iraqi', 'codeswitch'] as const) expect(FIXTURES.filter(f => f.mix === mix)).toHaveLength(20)
    expect(ARABIC_FIXTURES).toHaveLength(40)
  })

  it('covers every style, difficulty, performance and length in every language group', () => {
    for (const mix of ['en', 'iraqi', 'codeswitch'] as const) {
      const g = FIXTURES.filter(f => f.mix === mix)
      for (const key of ['style', 'difficulty', 'performance', 'length'] as const) {
        const seen = new Set(g.map(f => f[key]))
        const expected = key === 'style' ? 4 : key === 'difficulty' ? 4 : 3
        expect(seen.size, `${mix} ${key}`).toBe(expected)
      }
    }
  })

  it.each(FIXTURES.map(f => [f.id, f] as const))('%s is well formed', (_id, f) => {
    const s = toSession(f) // throws on a missing D|/R| prefix
    expect(s.transcript.length).toBeGreaterThanOrEqual(4)
    const bounds = { short: [4, 6], medium: [6, 9], long: [11, 14] }[f.length]
    expect(s.transcript.length, 'length matches label').toBeGreaterThanOrEqual(bounds[0])
    expect(s.transcript.length).toBeLessThanOrEqual(bounds[1])
    expect(s.transcript.some(t => t.role === 'rep')).toBe(true)
    for (const k of [...f.must, ...f.mustNot]) {
      expect(catalog.has(k.behavior), `${f.id}: unknown behavior ${k.behavior}`).toBe(true)
      const t = s.transcript[k.turn]
      expect(t, `${f.id}: turn ${k.turn} missing`).toBeDefined()
      expect(t.role, `${f.id}: turn ${k.turn} must be a rep turn`).toBe('rep')
    }
    expect(f.must.length, `${f.id} needs at least one expected behavior`).toBeGreaterThan(0)
  })

  it('keeps Arabic fixtures in Arabic script', () => {
    for (const f of ARABIC_FIXTURES) {
      const arabic = f.turns.join('').match(/[؀-ۿ]/g)?.length ?? 0
      expect(arabic, f.id).toBeGreaterThan(40)
    }
  })

  it('keeps iq-NN as the Iraqi pair of en-NN', () => {
    for (let n = 1; n <= 20; n++) {
      const en = FIXTURES.find(f => f.id === `en-${String(n).padStart(2, '0')}`)!
      const iq = FIXTURES.find(f => f.id === `iq-${String(n).padStart(2, '0')}`)!
      expect(iq.style, `pair ${n} style`).toBe(en.style)
      expect(iq.length, `pair ${n} length`).toBe(en.length)
      expect(iq.turns.length, `pair ${n} turn count`).toBe(en.turns.length)
    }
  })
})
