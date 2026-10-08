import { describe, expect, it } from 'vitest'
import { validateKnowledgePack } from '@/schemas/knowledge'
import { BLANK_PACK, fromRecord, newItem, newSource, nextItemNumber, toPayload, type PackForm } from '@/lib/knowledge-pack-form'

const filled = (): PackForm => ({
  ...BLANK_PACK, name: ' Pack ', productName: 'Prod', indication: '  ',
  items: [{
    ...newItem(1), kind: 'efficacy', textEn: ' Lowers BP. ', textAr: '   ', topics: ' Renal, ,Head-To-Head ', status: 'approved',
    sources: [{ ...newSource(), title: 'Label', reference: 'sec 4', version: ' ' }],
  }],
})

describe('toPayload', () => {
  it('trims text, drops an empty Arabic side, lowercases and splits topics, nulls blanks', () => {
    const p = toPayload(filled())
    expect(p.indication).toBeNull()
    expect(p.items[0].text).toEqual({ en: 'Lowers BP.' })
    expect(p.items[0].topics).toEqual(['renal', 'head-to-head'])
    expect(p.items[0].sources[0]).toMatchObject({ title: 'Label', version: null, externalSystem: null, externalId: null })
  })

  it('produces a payload the server validator accepts', () => {
    const res = validateKnowledgePack(toPayload(filled()))
    expect(res.ok).toBe(true)
  })

  it('produces a payload the validator rejects when an approved fact has no source', () => {
    const f = filled(); f.items[0].sources = []
    const res = validateKnowledgePack(toPayload(f))
    expect(res.ok).toBe(false)
  })
})

describe('fromRecord', () => {
  it('round-trips through toPayload', () => {
    const payload = toPayload(filled())
    const checked = validateKnowledgePack(payload)
    if (!checked.ok) throw new Error(checked.errors.join())
    expect(toPayload(fromRecord(checked.value))).toEqual(toPayload({ ...filled(), name: 'Pack' }))
  })
})

describe('nextItemNumber', () => {
  it('continues after the highest item-N id and starts at 1', () => {
    expect(nextItemNumber([])).toBe(1)
    expect(nextItemNumber([newItem(2), { ...newItem(7), id: 'custom' }, newItem(5)])).toBe(6)
  })
})
