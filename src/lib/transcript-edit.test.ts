import { describe, expect, it } from 'vitest'
import { applyCorrection, diffFragment, type SegmentRow } from './transcript-edit'

const row = (i: number, role: 'rep' | 'counterpart', text: string): SegmentRow =>
  ({ segment_index: i, speaker_role: role, text, start_ms: i * 1000, end_ms: i * 1000 + 900 })

describe('diffFragment', () => {
  it('returns only the replaced words', () => {
    expect(diffFragment('شلونك دكتور اليوم عندك وكت', 'شلونك دكتور اليوم عندك وقت')).toEqual({ heard: 'وكت', meant: 'وقت' })
  })
  it('handles a replaced run of several words', () => {
    expect(diffFragment('اني اريد ابين لك نتائج الدراسه', 'اني اريد اوضح لك نتائج الدراسه'))
      .toEqual({ heard: 'ابين', meant: 'اوضح' })
    expect(diffFragment('a b c d e', 'a x y e')).toEqual({ heard: 'b c d', meant: 'x y' })
  })
  it('returns null for a pure insertion, a pure deletion, and no change', () => {
    expect(diffFragment('a b c', 'a b x c')).toBeNull()
    expect(diffFragment('a b x c', 'a b c')).toBeNull()
    expect(diffFragment('a b c', 'a b c')).toBeNull()
  })
  it('returns null when most of the line was rewritten', () => {
    expect(diffFragment('one two three four five six seven eight nine ten', 'completely different words here for this line now ok yes')).toBeNull()
  })
  it('ignores extra spaces', () => {
    expect(diffFragment('a  b c', 'a b  d')).toEqual({ heard: 'c', meant: 'd' })
  })
})

describe('applyCorrection', () => {
  const rows = [row(0, 'rep', 'hello doctor'), row(1, 'counterpart', 'شنو تريد'), row(2, 'rep', 'عندك وكت')]

  it('swaps speakers without touching the text', () => {
    const r = applyCorrection(rows, { swapSegmentIndexes: [1] })
    expect(r.ok && r.rows.map(x => x.speaker_role)).toEqual(['rep', 'rep', 'rep'])
    expect(r.ok && r.changed).toBe(1)
    expect(r.ok && r.proposals).toEqual([])
  })

  it('edits text, keeps timing, and proposes the changed phrase', () => {
    const r = applyCorrection(rows, { edits: [{ segmentIndex: 2, text: '  عندك وقت ' }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows[2]).toMatchObject({ text: 'عندك وقت', start_ms: 2000, end_ms: 2900, speaker_role: 'rep' })
    expect(r.changed).toBe(1)
    expect(r.proposals).toEqual([{ heard: 'وكت', meant: 'وقت' }])
  })

  it('counts an unchanged edit as no change', () => {
    const r = applyCorrection(rows, { edits: [{ segmentIndex: 0, text: 'hello doctor' }] })
    expect(r.ok && r.changed).toBe(0)
  })

  it('does not propose a phrase for a speaker swap, and de-duplicates the same fix', () => {
    const two = [row(0, 'rep', 'وكت'), row(1, 'rep', 'وكت')]
    const r = applyCorrection(two, { swapSegmentIndexes: [0], edits: [{ segmentIndex: 0, text: 'وقت' }, { segmentIndex: 1, text: 'وقت' }] })
    expect(r.ok && r.proposals).toEqual([{ heard: 'وكت', meant: 'وقت' }])
    expect(r.ok && r.changed).toBe(2)
  })

  it('rejects unknown segments, empty lines and over-long lines', () => {
    expect(applyCorrection(rows, { edits: [{ segmentIndex: 9, text: 'x' }] }).ok).toBe(false)
    expect(applyCorrection(rows, { swapSegmentIndexes: [9] }).ok).toBe(false)
    expect(applyCorrection(rows, { edits: [{ segmentIndex: 0, text: '   ' }] }).ok).toBe(false)
    expect(applyCorrection(rows, { edits: [{ segmentIndex: 0, text: 'x'.repeat(2001) }] }).ok).toBe(false)
  })

  it('does not mutate the input rows', () => {
    applyCorrection(rows, { swapSegmentIndexes: [0], edits: [{ segmentIndex: 2, text: 'changed' }] })
    expect(rows[0].speaker_role).toBe('rep')
    expect(rows[2].text).toBe('عندك وكت')
  })
})
