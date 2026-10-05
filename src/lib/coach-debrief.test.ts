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
  it('requires only a real doctor and an account; objective, measure and reflections may be empty', () => {
    expect(parseDebriefInput(input)).toEqual(input)
    const bare = { ...input, objective: ' ', successMeasure: '', reflections: { wentWell: '', changeNextTime: ' ', objectiveReview: '' } }
    expect(parseDebriefInput(bare)).toEqual({ ...input, objective: '', successMeasure: '', reflections: { wentWell: '', changeNextTime: '', objectiveReview: '' } })
    for (const v of [null, [], { ...input, doctorId: 'bad' }, { ...input, account: 'hi' },
      { ...input, account: 'x'.repeat(12001) }, { ...input, objective: 'x'.repeat(501) },
      { ...input, successMeasure: 5 }, { ...input, reflections: { ...input.reflections, wentWell: 'x'.repeat(2001) } },
      { ...input, reflections: { ...input.reflections, wentWell: undefined } },
      { ...input, lang: 'xx' }]) expect(parseDebriefInput(v)).toBeNull()
  })
  it('accepts an optional previous action and rejects malformed ones', () => {
    const pa = { text: ' Ask one clarifying question. ', status: 'partly' }
    expect(parseDebriefInput({ ...input, previousAction: pa })?.previousAction).toEqual({ text: 'Ask one clarifying question.', status: 'partly' })
    expect(parseDebriefInput(input)).not.toHaveProperty('previousAction')
    for (const bad of ['x', { text: '', status: 'done' }, { text: 'x', status: 'maybe' }, { text: 'x'.repeat(2001), status: 'done' }]) expect(parseDebriefInput({ ...input, previousAction: bad })).toBeNull()
    expect(debriefPrompt({ ...input, previousAction: { text: 'Ask one question.', status: 'done' } }, 'Dr X').prompt).toContain('previousAction')
  })
  it('keeps up to three short promises and never fails a report over a bad promise list', () => {
    const parse = (promises: unknown) => parseDebriefResult(JSON.stringify({ questions: [], promises, report }))
    expect(parse([' Bring the study ', 'Call back', 'x', 'four'])?.promises).toEqual(['Bring the study', 'Call back', 'x'])
    expect(parse(['', 5, null, 'y'.repeat(301), 'ok'])?.promises).toEqual(['ok'])
    expect(parse('not a list')?.promises).toEqual([])
    expect(parseDebriefResult(JSON.stringify({ questions: [], report }))?.promises).toEqual([])
    expect(debriefPrompt(input, 'Dr X').system).toContain('"promises"')
  })
  it('accepts an optional coaching focus from the known list and rejects anything else', () => {
    expect(parseDebriefInput({ ...input, focus: 'closing' })?.focus).toBe('closing')
    expect(parseDebriefInput({ ...input, focus: '' })).not.toHaveProperty('focus')
    expect(parseDebriefInput(input)).not.toHaveProperty('focus')
    expect(parseDebriefInput({ ...input, focus: 'charm' })).toBeNull()
    const prompt = debriefPrompt({ ...input, focus: 'objections' }, 'Dr X')
    expect(prompt.system).toContain('"focus"')
    expect(prompt.prompt).toContain('objections or concerns')
    expect(debriefPrompt(input, 'Dr X').prompt).not.toContain('focusMeaning')
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
