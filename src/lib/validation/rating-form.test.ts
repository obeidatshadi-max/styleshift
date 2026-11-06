import { describe, it, expect } from 'vitest'
import { emptyForm, formToItems, itemsToForm, parseTurns } from './rating-form'
import { validateRating } from './rating'

describe('rating form', () => {
  it('sends only the answered domains', () => {
    const f = emptyForm()
    f.opening = { answer: '4', turns: '1, 3', note: ' good ', uncertain: true }
    f.composure = { answer: 'NO', turns: '', note: '', uncertain: false }
    expect(formToItems(f)).toEqual([
      { domain: 'opening', observable: true, score: 4, turnRefs: [1, 3], note: 'good', uncertain: true },
      { domain: 'composure', observable: false, score: null, turnRefs: [], note: null, uncertain: false },
    ])
  })

  it('what the form sends passes the server rules, and what the server stores fills the form back in', () => {
    const f = emptyForm()
    f.closing = { answer: '2', turns: '0', note: '', uncertain: false }
    const checked = validateRating({ items: formToItems(f) }, { submit: false, turnIndexes: [0, 1] })
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(itemsToForm(checked.value.items).closing).toEqual(f.closing)
  })

  it('keeps a typo as NaN so the server names it instead of the form hiding it', () => {
    expect(parseTurns('1, x, 2;3')).toEqual([1, NaN, 2, 3])
    const f = emptyForm()
    f.opening = { answer: '3', turns: 'two', note: '', uncertain: false }
    const checked = validateRating({ items: formToItems(f) }, { submit: false })
    expect(checked.ok).toBe(false)
  })

  it('an empty form sends nothing', () => {
    expect(formToItems(emptyForm())).toEqual([])
  })
})
