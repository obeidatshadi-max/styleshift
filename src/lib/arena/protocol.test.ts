import { describe, expect, it } from 'vitest'
import {
  LIMITS, cleanAnswers, cleanMarkItems, cleanPhoto, cleanText, hashPin, isExpired, isMarkKey, isTeamId,
  makeCode, normalizeCode, photoBytes, safeEqual, verifyPin,
} from './protocol'

describe('arena class codes', () => {
  it('makes 6-character codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const c = makeCode()
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
      expect(normalizeCode(c)).toBe(c)
    }
  })
  it('normalizes phone input and rejects bad codes', () => {
    expect(normalizeCode(' abc 234 ')).toBe('ABC234')
    expect(normalizeCode('ab-c23-4')).toBe('ABC234')
    expect(normalizeCode('ABC10O')).toBeNull()
    expect(normalizeCode('ABCDE')).toBeNull()
    expect(normalizeCode(123456)).toBeNull()
  })
})

describe('arena input cleaning', () => {
  it('trims and bounds text, counting characters not bytes', () => {
    expect(cleanText('  Rana   K ', 40)).toBe('Rana K')
    expect(cleanText('   ', 40)).toBeNull()
    expect(cleanText('   ', 40, true)).toBe('')
    expect(cleanText('ر'.repeat(40), 40)).toBe('ر'.repeat(40))
    expect(cleanText('x'.repeat(41), 40)).toBeNull()
  })
  it('accepts answer objects under the size cap only', () => {
    expect(cleanAnswers({ p1: 1, l1: { driver: 'x' } })).toEqual({ p1: 1, l1: { driver: 'x' } })
    expect(cleanAnswers([1])).toBeNull()
    expect(cleanAnswers({ big: 'x'.repeat(LIMITS.answersChars) })).toBeNull()
  })
  it('accepts whole-number marks within range only', () => {
    expect(cleanMarkItems({ ca4: 4, l1: 12 })).toEqual({ ca4: 4, l1: 12 })
    expect(cleanMarkItems({ ca4: 4.5 })).toBeNull()
    expect(cleanMarkItems({ ca4: -1 })).toBeNull()
    expect(cleanMarkItems({ 'bad key': 1 })).toBeNull()
  })
  it('accepts only JPEG data URLs as team photos', () => {
    expect(cleanPhoto('')).toBeNull()
    expect(cleanPhoto(undefined)).toBeNull()
    expect(cleanPhoto('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ')
    expect(cleanPhoto('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined()
    expect(cleanPhoto('javascript:alert(1)')).toBeUndefined()
    expect(cleanPhoto('data:image/jpeg;base64,' + 'A'.repeat(LIMITS.photoChars))).toBeUndefined()
    expect(Array.from(photoBytes('data:image/jpeg;base64,/9j/'))).toEqual([0xff, 0xd8, 0xff])
  })
  it('validates team ids and mark keys', () => {
    expect(isTeamId('tabc12345')).toBe(true)
    expect(isTeamId('t<script>')).toBe(false)
    expect(isMarkKey('pre_6f1c2f7e-1d2b-4c1a-9c55-0a1b2c3d4e5f')).toBe(true)
    expect(isMarkKey('post_tabc12345')).toBe(true)
    expect(isMarkKey('other_x')).toBe(false)
  })
})

describe('arena secrets', () => {
  it('verifies the PIN against its salted hash', () => {
    const hash = hashPin('4321', 'salt')
    expect(verifyPin('4321', 'salt', hash)).toBe(true)
    expect(verifyPin('1234', 'salt', hash)).toBe(false)
    expect(verifyPin('4321', 'other', hash)).toBe(false)
    expect(verifyPin('12', 'salt', hashPin('12', 'salt'))).toBe(false)
  })
  it('compares secrets safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual(undefined, 'abc')).toBe(false)
  })
  it('reports expiry', () => {
    expect(isExpired('2026-01-01T00:00:00Z', Date.parse('2026-02-01T00:00:00Z'))).toBe(true)
    expect(isExpired('2026-03-01T00:00:00Z', Date.parse('2026-02-01T00:00:00Z'))).toBe(false)
  })
})

describe('arena groups', () => {
  it('cleans group names and drops duplicates', async () => {
    const { cleanGroupNames } = await import('./protocol')
    expect(cleanGroupNames(['Group 1', ' group 1 ', 'Hawks'])).toEqual(['Group 1', 'Hawks'])
    expect(cleanGroupNames([])).toBeNull()
    expect(cleanGroupNames(['ok', ''])).toBeNull()
    expect(cleanGroupNames('Group 1')).toBeNull()
  })
  it('makes valid team ids', async () => {
    const { makeTeamId, isTeamId } = await import('./protocol')
    for (let i = 0; i < 100; i++) expect(isTeamId(makeTeamId())).toBe(true)
  })
  it('splits people evenly and never moves members of submitted teams', async () => {
    const { planSplit } = await import('./protocol')
    const people = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, teamId: i === 0 ? 'done' : null as string | null }))
    const teams = [{ id: 'a', submitted: false }, { id: 'b', submitted: false }, { id: 'c', submitted: false }, { id: 'done', submitted: true }]
    const plan = planSplit(people, teams, false)!
    expect(plan.p0).toBeUndefined()
    const sizes = Object.values(plan).reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {})
    expect(Object.keys(sizes).sort()).toEqual(['a', 'b', 'c'])
    expect(Math.max(...Object.values(sizes)) - Math.min(...Object.values(sizes))).toBeLessThanOrEqual(1)
  })
  it('only places people without a group when asked, filling the smallest groups', async () => {
    const { planSplit } = await import('./protocol')
    const people = [{ id: 'x', teamId: 'a' }, { id: 'y', teamId: 'a' }, { id: 'z', teamId: null }, { id: 'w', teamId: null }]
    const plan = planSplit(people, [{ id: 'a', submitted: false }, { id: 'b', submitted: false }], true)!
    expect(plan).toEqual({ z: 'b', w: 'b' })
    expect(planSplit(people, [{ id: 'a', submitted: true }], false)).toBeNull()
  })
})
