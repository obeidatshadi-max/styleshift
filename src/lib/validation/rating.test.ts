import { describe, it, expect } from 'vitest'
import { validateRating, NOTE_MAX } from './rating'
import { RUBRIC_DOMAINS } from './rubric'

const item = (domain: string, extra: Record<string, unknown> = {}) => ({ domain, observable: true, score: 3, turnRefs: [0], ...extra })
const full = () => ({ unscorable: false, items: RUBRIC_DOMAINS.map(d => item(d)) })
const err = (v: unknown, o: Parameters<typeof validateRating>[1] = { submit: false }) => {
  const r = validateRating(v, o)
  return r.ok ? null : r.error
}

describe('validateRating', () => {
  it('accepts a complete rating and normalises it', () => {
    const r = validateRating({ items: [item('opening', { turnRefs: [2, 0, 2], note: '', uncertain: true })] }, { submit: false })
    expect(r).toEqual({ ok: true, value: { unscorable: false, items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [0, 2], note: null, uncertain: true }] } })
  })

  it('a draft may answer only some domains; a submission may not', () => {
    expect(err({ items: [item('opening')] })).toBeNull()
    expect(err({ items: [item('opening')] }, { submit: true })).toMatch(/Missing: questioning/)
    expect(err(full(), { submit: true })).toBeNull()
  })

  it('an unscorable case can be submitted with no domain items', () => {
    expect(err({ unscorable: true, items: [] }, { submit: true })).toBeNull()
  })

  it('"not observable" has no score and needs no turn; an observable domain needs both', () => {
    expect(err({ items: [{ domain: 'composure', observable: false, turnRefs: [] }] })).toBeNull()
    expect(err({ items: [{ domain: 'composure', observable: false, score: 2, turnRefs: [] }] })).toMatch(/no score/)
    expect(err({ items: [item('composure', { turnRefs: [] })] })).toMatch(/at least one turn/)
    expect(err({ items: [item('composure', { score: undefined })] })).toMatch(/score 1 to 5/)
  })

  it('a 5 needs two turns of evidence (rubric section 1); a 4 needs one', () => {
    expect(err({ items: [item('opening', { score: 5, turnRefs: [0] })] })).toMatch(/needs at least two turns/)
    expect(err({ items: [item('opening', { score: 5, turnRefs: [0, 1] })] })).toBeNull()
    expect(err({ items: [item('opening', { score: 4, turnRefs: [0] })] })).toBeNull()
  })

  it.each([0, 6, 2.5, '3', null])('rejects the score %s on an observable domain', score => {
    expect(err({ items: [item('opening', { score })] })).toMatch(/score 1 to 5/)
  })

  it('rejects an unknown or repeated domain', () => {
    expect(err({ items: [item('charisma')] })).toMatch(/Unknown domain/)
    expect(err({ items: [item('opening'), item('opening')] })).toMatch(/twice/)
  })

  it('rejects a turn reference outside the case, and a bad reference list', () => {
    expect(err({ items: [item('opening', { turnRefs: [7] })] }, { submit: false, turnIndexes: [0, 1, 2] })).toMatch(/not in this case/)
    expect(err({ items: [item('opening', { turnRefs: [1] })] }, { submit: false, turnIndexes: [0, 1, 2] })).toBeNull()
    expect(err({ items: [item('opening', { turnRefs: [-1] })] })).toMatch(/whole numbers/)
    expect(err({ items: [item('opening', { turnRefs: 'x' })] })).toMatch(/whole numbers/)
  })

  it('limits the note length', () => {
    expect(err({ items: [item('opening', { note: 'x'.repeat(NOTE_MAX) })] })).toBeNull()
    expect(err({ items: [item('opening', { note: 'x'.repeat(NOTE_MAX + 1) })] })).toMatch(/at most/)
  })

  it.each([null, 'x', 5, [], {}, { items: 'x' }, { items: [null] }, { items: [[]] }, { unscorable: 'yes', items: [] }])('rejects the malformed input %j', v => {
    expect(err(v)).not.toBeNull()
  })
})
