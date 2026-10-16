import { describe, expect, it } from 'vitest'
import { interpret, type Knowledge } from './core'
import { summarizeFeedback } from './market'
const entry: Knowledge = { id: 'e', expression: 'ما عندي وكت', literal_meaning: 'No time', contextual_meaning: 'Possible time concern',
  region: 'baghdad', specialty: 'general', kind: 'workflow', uncertainty: 'Confirm', source_reference: 'Synthetic expert example', status: 'approved', version: 2 }
describe('healthcare communication and sample intelligence', () => {
  it('never turns a quoted concern into a verified objection or personality claim', () => {
    const result = interpret('شنو يعني ما عندي وكت؟', [entry])
    expect(result.communication.observations[0].type).toBe('expression_present')
    expect(result.communication.hypotheses[0].requiresSpeakerConfirmation).toBe(true)
    expect(result.communication.hiddenMotives).toEqual([])
    expect(result.communication.personalityInferences).toEqual([])
  })
  it('recognizes reviewed pharmacy terms but cannot recommend treatment', () => {
    const result = interpret('OTC', [{ ...entry, kind: 'pharmacy', expression: 'OTC' }])
    expect(result.medical.terms[0]).toMatchObject({ term: 'OTC', source: entry.source_reference })
    expect(result.medical.clinicalRecommendations).toEqual([])
  })
  it('counts recurring candidates only across distinct evidence records with approved sources', () => {
    const feedback = [{ id: 'a', text: entry.expression, region: 'baghdad' as const }, { id: 'b', text: entry.expression, region: 'baghdad' as const }]
    const result = summarizeFeedback([...feedback, feedback[0]], [entry])
    expect(result.sampleSize).toBe(2)
    expect(result.recurringCandidates[0]).toMatchObject({ count: 2, feedbackIds: ['a', 'b'], source: entry.source_reference })
    expect(result.limitation).toContain('not a verified market finding')
    expect(summarizeFeedback(feedback, [{ ...entry, status: 'rejected' }]).recurringCandidates).toEqual([])
    expect(summarizeFeedback([feedback[0]], [entry]).recurringCandidates).toEqual([])
  })
})
