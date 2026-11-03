import { describe, expect, it } from 'vitest'
import { applyClaimCheck, claimCheckPrompt, parseClaimCheck } from './claim-check'
import type { DebriefInput, DebriefReport } from './coach-debrief'

const report: DebriefReport = {
  summary: 'You visited for 5 minutes. You made a clear commitment to deliver the data.',
  strength: 'You asked what patients he sees. You confirmed a next step in writing.',
  priority: 'Notice your first words.', hypothesis: 'He may have felt unheard.',
  betterResponse: 'x', objectiveReview: 'No objective stated.', nextAction: 'y', practiceFocus: 'z',
}
const input = { doctorId: 'd', account: 'I promised to bring the data next week.', objective: '', successMeasure: '', lang: 'en',
  reflections: { wentWell: '', changeNextTime: '', objectiveReview: '' } } as DebriefInput

describe('claim check', () => {
  it('sends the account and only the checked fields', () => {
    const p = claimCheckPrompt(input, report)
    expect(p.prompt).toContain('I promised to bring the data next week.')
    expect(p.prompt).not.toContain('betterResponse')
  })

  it('parses the verifier reply and tolerates a code fence', () => {
    const raw = '```json\n{"unsupported":{"strength":["You confirmed a next step in writing."]}}\n```'
    expect(parseClaimCheck(raw)).toMatchObject({ strength: ['You confirmed a next step in writing.'] })
  })

  it('returns null for malformed output', () => {
    expect(parseClaimCheck('nope')).toBeNull()
    expect(parseClaimCheck('{"unsupported":null}')).toBeNull()
  })

  it('removes only exact flagged sentences', () => {
    const r = applyClaimCheck(report, { strength: ['You confirmed a next step in writing.'] })
    expect(r.report.strength).toBe('You asked what patients he sees.')
    expect(r.removed).toBe(1)
  })

  it('ignores a flagged sentence that is not in the field (paraphrase cannot delete)', () => {
    const r = applyClaimCheck(report, { strength: ['You wrote down the next step.'] })
    expect(r.report.strength).toBe(report.strength)
    expect(r.removed).toBe(0)
  })

  it('never empties a field', () => {
    const r = applyClaimCheck(report, { hypothesis: ['He may have felt unheard.'] })
    expect(r.report.hypothesis).toBe('He may have felt unheard.')
    expect(r.removed).toBe(0)
  })
})
