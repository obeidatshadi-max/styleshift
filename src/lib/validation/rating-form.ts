import { RUBRIC_DOMAINS, type RubricDomain } from './rubric'
import type { RatingItemInput } from './rating'

/** What an assessor has typed for one domain. `answer` is empty until they choose a score or "not observable". */
export interface DomainForm {
  answer: '' | '1' | '2' | '3' | '4' | '5' | 'NO'
  turns: string
  note: string
  uncertain: boolean
}

export type RatingForm = Record<RubricDomain, DomainForm>

export const emptyForm = (): RatingForm =>
  Object.fromEntries(RUBRIC_DOMAINS.map(d => [d, { answer: '', turns: '', note: '', uncertain: false }])) as RatingForm

/** "1, 3 ,3" -> [1, 3]. Anything that is not a whole number is kept as NaN so the server can name the problem. */
export function parseTurns(text: string): number[] {
  return text.split(/[\s,;]+/).filter(Boolean).map(Number)
}

/** Only answered domains are sent, so a half-filled form saves as a draft and the server decides about completeness. */
export function formToItems(form: RatingForm): Record<string, unknown>[] {
  return RUBRIC_DOMAINS.filter(d => form[d].answer !== '').map(d => {
    const f = form[d]
    const observable = f.answer !== 'NO'
    return { domain: d, observable, score: observable ? Number(f.answer) : null, turnRefs: parseTurns(f.turns), note: f.note.trim() || null, uncertain: f.uncertain }
  })
}

export function itemsToForm(items: readonly RatingItemInput[]): RatingForm {
  const form = emptyForm()
  for (const i of items) {
    form[i.domain] = { answer: i.observable ? (String(i.score) as DomainForm['answer']) : 'NO', turns: i.turnRefs.join(', '), note: i.note ?? '', uncertain: i.uncertain }
  }
  return form
}
