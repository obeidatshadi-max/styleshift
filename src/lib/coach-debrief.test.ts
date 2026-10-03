import { describe, expect, it } from 'vitest'
import { debriefPrompt, parseDebriefInput, parseDebriefResult } from './coach-debrief'

const input = {
  doctorId: '00000000-0000-4000-8000-000000000001',
  account: 'The doctor said the price was high. I repeated the benefits.',
  objective: 'Agree a follow-up meeting', successMeasure: 'The doctor accepts a date', lang: 'en' as const,
  reflections: { wentWell: 'I listened first.', changeNextTime: 'I would ask a follow-up.', objectiveReview: 'Not achieved. No date was agreed.' },
}
const report = {
  summary: 'Based on your account, price came up.', strength: 'You recalled the objection.', priority: 'Clarify the comparison.',
  hypothesis: 'Cost may be a concern.', betterResponse: 'What are you comparing it with?',
  objectiveReview: 'The objective was not achieved because a date was not agreed.',
  nextAction: 'Ask one clarifying question.', practiceFocus: 'Practice clarifying a price objection.',
}

describe('debrief evidence and contracts', () => {
  it('requires a real doctor, objective, success measure and all three guided reflections', () => {
    expect(parseDebriefInput(input)).toEqual(input)
    for (const v of [null, [], { ...input, doctorId: 'bad' }, { ...input, account: 'hi' },
      { ...input, account: 'x'.repeat(12001) }, { ...input, objective: ' ' },
      { ...input, successMeasure: '' }, { ...input, reflections: { ...input.reflections, wentWell: '' } },
      { ...input, lang: 'xx' }]) expect(parseDebriefInput(v)).toBeNull()
  })
  it('rejects incomplete reports and removes unrecognized model fields', () => {
    expect(parseDebriefResult(JSON.stringify({ questions: [], report: { summary: 'hello' } }))).toBeNull()
    expect(parseDebriefResult(JSON.stringify({ questions: [], report: { ...report, nextAction: ' ' } }))).toBeNull()
    expect(parseDebriefResult(JSON.stringify({ questions: [], report: { ...report, score: 90 } }))?.report).toEqual(report)
  })
  it('keeps a valid report when the model adds stray clarifying questions', () => {
    for (const questions of [['follow up'], ['q1', 'q2', 'q3'], undefined]) {
      const result = parseDebriefResult(JSON.stringify({ questions, report }))
      expect(result?.report).toEqual(report)
      expect(result?.questions).toEqual([])
    }
  })
  it('grounds coaching in recalled evidence, doctor context and the stated measure', () => {
    const prompt = debriefPrompt({ ...input, lang: 'ar' }, 'Dr. Example')
    expect(prompt.system).toContain('Arabic')
    expect(prompt.system).toContain('You did not observe the call')
    expect(prompt.system).toContain('stated success measure')
    expect(prompt.system).toContain('betterResponse is a suggested future phrase')
    expect(JSON.parse(prompt.prompt)).toMatchObject({ doctorName: 'Dr. Example', doctorId: input.doctorId })
  })
})
