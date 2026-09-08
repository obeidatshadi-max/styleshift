import { describe, it, expect } from 'vitest'
import {
  CLOSING_CRITERIA, isClosingCriterion,
  buildClosingJudgePrompt, parseClosingJudgeResponse,
} from './voice-partner-closing'
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

describe('isClosingCriterion', () => {
  it('accepts each valid criterion', () => {
    for (const c of CLOSING_CRITERIA) expect(isClosingCriterion(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isClosingCriterion('made_up')).toBe(false)
    expect(isClosingCriterion(123)).toBe(false)
    expect(isClosingCriterion(undefined)).toBe(false)
  })
})

describe('buildClosingJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'So we agreed adherence is the concern.')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'statement')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep statement text verbatim', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', '', 'Given what we discussed about your patients, would you be open to trying it with your next three cases?')
    expect(prompt).toContain('Given what we discussed about your patients, would you be open to trying it with your next three cases?')
  })

  it('describes all four criteria', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"summarized_agreement"')
    expect(prompt).toContain('point of agreement')
    expect(prompt).toContain('"asked_commitment"')
    expect(prompt).toContain('clear, specific closing question')
    expect(prompt).toContain('"ends_on_question"')
    expect(prompt).toContain('keep talking after')
    expect(prompt).toContain('"concise"')
  })

  it('asks for a JSON response with doctorText and criteriaHit', () => {
    const prompt = buildClosingJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"criteriaHit"')
  })
})

describe('parseClosingJudgeResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseClosingJudgeResponse('{"doctorText":"Alright.","criteriaHit":["asked_commitment","concise"]}')
    expect(parsed).toEqual({ doctorText: 'Alright.', criteriaHit: ['asked_commitment', 'concise'] })
  })

  it('strips surrounding commentary/markdown fences', () => {
    const parsed = parseClosingJudgeResponse('```json\n{"doctorText":"Fine.","criteriaHit":[]}\n```')
    expect(parsed).toEqual({ doctorText: 'Fine.', criteriaHit: [] })
  })

  it('returns null for malformed JSON', () => {
    expect(parseClosingJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"","criteriaHit":[]}')).toBeNull()
    expect(parseClosingJudgeResponse('{}')).toBeNull()
  })

  it('defaults criteriaHit to an empty array when missing', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"Fine."}')).toEqual({ doctorText: 'Fine.', criteriaHit: [] })
  })

  it('defaults criteriaHit to an empty array when not an array', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"Fine.","criteriaHit":"concise"}')).toEqual({ doctorText: 'Fine.', criteriaHit: [] })
  })

  it('filters out unknown strings from criteriaHit', () => {
    expect(parseClosingJudgeResponse('{"doctorText":"Fine.","criteriaHit":["concise","made_up","ends_on_question"]}')).toEqual({
      doctorText: 'Fine.', criteriaHit: ['concise', 'ends_on_question'],
    })
  })
})
