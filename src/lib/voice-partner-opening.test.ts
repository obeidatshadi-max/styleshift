import { describe, it, expect } from 'vitest'
import {
  OPENING_CRITERIA, isOpeningCriterion,
  buildOpeningJudgePrompt, parseOpeningJudgeResponse,
} from './voice-partner-opening'
import type { Doctor } from '@/types/game'

function doctorFixture(over: Partial<Doctor> = {}): Doctor {
  return {
    id: 'd1', rep_id: 'r1', name: 'Dr. Amina',
    specialty: null, workplace: null, style: 'analytical',
    assertiveness: null, responsiveness: null,
    key_phrases: null, objections: [], objection_notes: null, notes: null,
    created_at: '', updated_at: '',
    ...over,
  }
}

describe('isOpeningCriterion', () => {
  it('accepts each valid criterion', () => {
    for (const c of OPENING_CRITERIA) expect(isOpeningCriterion(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isOpeningCriterion('made_up')).toBe(false)
    expect(isOpeningCriterion(123)).toBe(false)
    expect(isOpeningCriterion(undefined)).toBe(false)
  })
})

describe('buildOpeningJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'Let me tell you about your product.')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'statement')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep statement text verbatim', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'Many of your elderly patients struggle with adherence.')
    expect(prompt).toContain('Many of your elderly patients struggle with adherence.')
  })

  it('describes all four criteria', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"problem_led"')
    expect(prompt).toContain('specific patient or clinical problem')
    expect(prompt).toContain('"relevant"')
    expect(prompt).toContain("this doctor's patient type")
    expect(prompt).toContain('"solution_linked"')
    expect(prompt).toContain('without inventing clinical data')
    expect(prompt).toContain('"concise"')
    expect(prompt).toContain('40 seconds')
  })

  it('asks for a JSON response with doctorText and criteriaHit', () => {
    const prompt = buildOpeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"criteriaHit"')
  })
})

describe('parseOpeningJudgeResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseOpeningJudgeResponse('{"doctorText":"Go on.","criteriaHit":["problem_led","concise"]}')
    expect(parsed).toEqual({ doctorText: 'Go on.', criteriaHit: ['problem_led', 'concise'] })
  })

  it('strips surrounding commentary/markdown fences', () => {
    const parsed = parseOpeningJudgeResponse('```json\n{"doctorText":"Interesting.","criteriaHit":[]}\n```')
    expect(parsed).toEqual({ doctorText: 'Interesting.', criteriaHit: [] })
  })

  it('returns null for malformed JSON', () => {
    expect(parseOpeningJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"","criteriaHit":[]}')).toBeNull()
    expect(parseOpeningJudgeResponse('{}')).toBeNull()
  })

  it('defaults criteriaHit to an empty array when missing', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"Go on."}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('defaults criteriaHit to an empty array when not an array', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"Go on.","criteriaHit":"problem_led"}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('filters out unknown strings from criteriaHit', () => {
    expect(parseOpeningJudgeResponse('{"doctorText":"Go on.","criteriaHit":["problem_led","made_up","concise"]}')).toEqual({
      doctorText: 'Go on.', criteriaHit: ['problem_led', 'concise'],
    })
  })
})
