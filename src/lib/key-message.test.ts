import { describe, expect, it } from 'vitest'
import { applyFidelity, parseFeedback, parseFidelity, parseKeyMessageInput, parsePracticeInput, parseVersions, visibleToRep, type Versions } from './key-message'

const D = '11111111-1111-4111-8111-111111111111'
const v = (over: Partial<Versions> = {}): Versions => ({ driver: 'Drive one.', expressive: 'Express one.', amiable: 'Amiable one.', analytical: 'Analytical one.', ...over })

describe('parseKeyMessageInput', () => {
  it('accepts a plain message and defaults to written', () => {
    expect(parseKeyMessageInput({ text: '  Statin X cuts LDL.  ' })).toEqual({ text: 'Statin X cuts LDL.', mode: 'written', doctorId: null, repIds: null, dueDate: null })
  })
  it('rejects empty, oversized, bad mode, bad ids and bad dates', () => {
    expect(parseKeyMessageInput({ text: '   ' })).toBeNull()
    expect(parseKeyMessageInput({ text: 'x'.repeat(601) })).toBeNull()
    expect(parseKeyMessageInput({ text: 'ok', mode: 'sing' })).toBeNull()
    expect(parseKeyMessageInput({ text: 'ok', doctorId: 'nope' })).toBeNull()
    expect(parseKeyMessageInput({ text: 'ok', repIds: ['nope'] })).toBeNull()
    expect(parseKeyMessageInput({ text: 'ok', dueDate: '2026-13-99' })).toBeNull()
    expect(parseKeyMessageInput(null)).toBeNull()
  })
  it('treats an empty rep list as everyone', () => {
    expect(parseKeyMessageInput({ text: 'ok', repIds: [] })?.repIds).toBeNull()
    expect(parseKeyMessageInput({ text: 'ok', repIds: [D], doctorId: D, mode: 'verbal' })).toMatchObject({ repIds: [D], doctorId: D, mode: 'verbal' })
  })
})

describe('parseVersions', () => {
  it('needs all four styles, non-empty', () => {
    const ok = JSON.stringify(v())
    expect(parseVersions(ok)).toEqual(v())
    expect(parseVersions('```json\n' + ok + '\n```')).toEqual(v())
    expect(parseVersions(JSON.stringify({ driver: 'a' }))).toBeNull()
    expect(parseVersions(JSON.stringify(v({ amiable: '  ' })))).toBeNull()
    expect(parseVersions('not json')).toBeNull()
  })
})

describe('applyFidelity', () => {
  it('removes only exact flagged sentences', () => {
    const r = applyFidelity(v({ driver: 'Statin X cuts LDL. It also halves strokes.' }), { driver: ['It also halves strokes.'] })
    expect(r.versions.driver).toBe('Statin X cuts LDL.')
    expect(r.removed).toBe(1)
    expect(r.kept).toEqual([])
  })
  it('tidies the join when the checker flags a clause, not a whole sentence (real model output)', () => {
    const en = 'Imagine giving your patients a simple once-daily option that actually lowers their LDL—one pill, done, and they can focus on living their lives.'
    expect(applyFidelity(v({ expressive: en }), { expressive: ['one pill, done, and they can focus on living their lives'] }).versions.expressive)
      .toBe('Imagine giving your patients a simple once-daily option that actually lowers their LDL.')
    const ar = 'دواؤنا يخفض الكوليسترول، وهذا يغيّر حياتهم!'
    expect(applyFidelity(v({ driver: ar }), { driver: ['وهذا يغيّر حياتهم'] }).versions.driver).toBe('دواؤنا يخفض الكوليسترول!')
    expect(applyFidelity(v({ driver: 'Lowers LDL. That simplicity helps routines.' }), { driver: ['That simplicity helps routines.'] }).versions.driver).toBe('Lowers LDL.')
  })
  it('ignores a paraphrase it cannot find', () => {
    const r = applyFidelity(v({ driver: 'Statin X cuts LDL.' }), { driver: ['Statin X reduces LDL.'] })
    expect(r.versions.driver).toBe('Statin X cuts LDL.')
    expect(r.removed).toBe(0)
  })
  it('never empties a version and reports it', () => {
    const r = applyFidelity(v({ driver: 'Only an added claim.' }), { driver: ['Only an added claim.'] })
    expect(r.versions.driver).toBe('Only an added claim.')
    expect(r.kept).toEqual(['driver'])
    expect(r.removed).toBe(0)
  })
})

describe('parseFidelity', () => {
  it('reads the added lists and drops junk', () => {
    expect(parseFidelity(JSON.stringify({ added: { driver: ['a', '', 3], amiable: 'x' } }))).toEqual({ driver: ['a'] })
    expect(parseFidelity('{"nope":1}')).toBeNull()
  })
})

describe('parsePracticeInput', () => {
  it('needs a known style and text, and share must be boolean', () => {
    expect(parsePracticeInput({ style: 'driver', text: ' hi ' })).toEqual({ style: 'driver', text: 'hi', share: false })
    expect(parsePracticeInput({ style: 'driver', text: 'hi', share: true })?.share).toBe(true)
    expect(parsePracticeInput({ style: 'boss', text: 'hi' })).toBeNull()
    expect(parsePracticeInput({ style: 'driver', text: '' })).toBeNull()
    expect(parsePracticeInput({ style: 'driver', text: 'hi', share: 'yes' })).toBeNull()
  })
})

describe('parseFeedback', () => {
  it('needs all four fields', () => {
    const f = { styleFit: 'a', faithful: 'b', strength: 'c', tryNext: 'd' }
    expect(parseFeedback(JSON.stringify(f))).toEqual(f)
    expect(parseFeedback(JSON.stringify({ ...f, tryNext: '' }))).toBeNull()
  })
})

describe('visibleToRep', () => {
  const row = (id: string, over: Record<string, unknown>) => ({ id, created_by: 'mgr', rep_ids: null as string[] | null, active: true, created_at: '2026-11-01T00:00:00Z', ...over })
  it('shows everyone-messages, addressed ones and own, hides others and inactive, newest first', () => {
    const rows = [
      row('all', {}),
      row('mine', { created_by: 'rep-1', rep_ids: ['rep-1'], created_at: '2026-11-03T00:00:00Z' }),
      row('other', { rep_ids: ['rep-2'] }),
      row('off', { active: false }),
      row('addr', { rep_ids: ['rep-1'], created_at: '2026-11-02T00:00:00Z' }),
    ]
    expect(visibleToRep(rows, 'rep-1').map(r => r.id)).toEqual(['mine', 'addr', 'all'])
  })
})
