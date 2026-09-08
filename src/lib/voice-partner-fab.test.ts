import { describe, it, expect } from 'vitest'
import {
  FAB_CRITERIA, isFabCriterion,
  buildFabJudgePrompt, parseFabJudgeResponse,
} from './voice-partner-fab'
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

describe('isFabCriterion', () => {
  it('accepts each valid criterion', () => {
    for (const c of FAB_CRITERIA) expect(isFabCriterion(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isFabCriterion('made_up')).toBe(false)
    expect(isFabCriterion(123)).toBe(false)
    expect(isFabCriterion(undefined)).toBe(false)
  })
})

describe('buildFabJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'Let me tell you about your product.')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'statement')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep statement text verbatim', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', '', 'Your product has a once-daily formulation, which means better adherence for your elderly patients.')
    expect(prompt).toContain('Your product has a once-daily formulation, which means better adherence for your elderly patients.')
  })

  it('describes all four criteria', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"feature_stated"')
    expect(prompt).toContain('concrete product feature or characteristic')
    expect(prompt).toContain('"benefit_linked"')
    expect(prompt).toContain('outcome or benefit')
    expect(prompt).toContain('"tailored"')
    expect(prompt).toContain("this doctor's patient")
    expect(prompt).toContain('"patient_centered"')
    expect(prompt).toContain('around the patient')
  })

  it('asks for a JSON response with doctorText and criteriaHit', () => {
    const prompt = buildFabJudgePrompt(doctorFixture(), 'driver', 'en', '', 'statement')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"criteriaHit"')
  })
})

describe('parseFabJudgeResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseFabJudgeResponse('{"doctorText":"Go on.","criteriaHit":["feature_stated","tailored"]}')
    expect(parsed).toEqual({ doctorText: 'Go on.', criteriaHit: ['feature_stated', 'tailored'] })
  })

  it('strips surrounding commentary/markdown fences', () => {
    const parsed = parseFabJudgeResponse('```json\n{"doctorText":"Interesting.","criteriaHit":[]}\n```')
    expect(parsed).toEqual({ doctorText: 'Interesting.', criteriaHit: [] })
  })

  it('returns null for malformed JSON', () => {
    expect(parseFabJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseFabJudgeResponse('{"doctorText":"","criteriaHit":[]}')).toBeNull()
    expect(parseFabJudgeResponse('{}')).toBeNull()
  })

  it('defaults criteriaHit to an empty array when missing', () => {
    expect(parseFabJudgeResponse('{"doctorText":"Go on."}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('defaults criteriaHit to an empty array when not an array', () => {
    expect(parseFabJudgeResponse('{"doctorText":"Go on.","criteriaHit":"feature_stated"}')).toEqual({ doctorText: 'Go on.', criteriaHit: [] })
  })

  it('filters out unknown strings from criteriaHit', () => {
    expect(parseFabJudgeResponse('{"doctorText":"Go on.","criteriaHit":["feature_stated","made_up","patient_centered"]}')).toEqual({
      doctorText: 'Go on.', criteriaHit: ['feature_stated', 'patient_centered'],
    })
  })
})
