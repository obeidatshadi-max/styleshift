import { describe, expect, it } from 'vitest'
import { debriefPrompt, parseDebriefInput, parseDebriefResult } from './coach-debrief'
const input = { account: 'The doctor said the price was high. I repeated the benefits.', objective: '', lang: 'en' as const, answers: [], finish: false }
const report = { summary: 'Based on your account, price came up.', strength: 'You recalled the objection.', priority: 'Clarify the comparison.', hypothesis: 'Cost may be a concern.', betterResponse: 'What are you comparing it with?', nextAction: 'Ask one clarifying question.', practiceFocus: 'Practice clarifying a price objection.' }
describe('debrief evidence and contracts', () => {
  it('rejects empty, oversized and malformed accounts before calling AI', () => {
    for (const v of [null, [], { ...input, account: 'hi' }, { ...input, account: 'x'.repeat(12001) }, { ...input, answers: [null] }, { ...input, lang: 'xx' }]) expect(parseDebriefInput(v)).toBeNull()
    expect(parseDebriefInput(input)).toEqual(input)
  })
  it('allows two questions but prevents repeated clarification after finishing', () => {
    const raw = JSON.stringify({ questions: ['What did the doctor say?'], report: null })
    expect(parseDebriefResult(raw, false)?.questions).toHaveLength(1)
    expect(parseDebriefResult(raw, true)).toBeNull()
    expect(parseDebriefResult(JSON.stringify({ questions: ['a', 'b', 'c'], report: null }), false)).toBeNull()
  })
  it('rejects incomplete reports and removes unrecognized model fields', () => {
    expect(parseDebriefResult(JSON.stringify({ questions: [], report: { summary: 'hello' } }), true)).toBeNull()
    expect(parseDebriefResult(JSON.stringify({ questions: [], report: { ...report, score: 90 } }), true)?.report).toEqual(report)
  })
  it('separates recalled evidence from observed performance and labels fictional practice', () => {
    const prompt = debriefPrompt({ ...input, lang: 'ar', finish: true })
    expect(prompt.system).toContain('Arabic')
    expect(prompt.system).toContain('never an observed conversation')
    expect(prompt.system).toContain('Do not score')
    expect(prompt.system).toContain('no further questions')
    expect(prompt.system).toContain('fictional practice situation')
    expect(JSON.parse(prompt.prompt).account).toBe(input.account)
  })
})
