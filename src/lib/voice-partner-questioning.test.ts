import { describe, it, expect } from 'vitest'
import {
  QUESTION_TYPES, isQuestionType,
  LISTENING_CUES, isListeningCue,
  buildQuestionJudgePrompt, parseQuestionJudgeResponse,
  buildListeningJudgePrompt, parseListeningJudgeResponse,
} from './voice-partner-questioning'
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

describe('isQuestionType', () => {
  it('accepts each valid question type', () => {
    for (const q of QUESTION_TYPES) expect(isQuestionType(q)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isQuestionType('made_up')).toBe(false)
    expect(isQuestionType(123)).toBe(false)
    expect(isQuestionType(undefined)).toBe(false)
  })
})

describe('isListeningCue', () => {
  it('accepts each valid cue', () => {
    for (const c of LISTENING_CUES) expect(isListeningCue(c)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isListeningCue('made_up')).toBe(false)
    expect(isListeningCue(123)).toBe(false)
  })
})

describe('buildQuestionJudgePrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'What challenges do your patients face?')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'question')
    expect(prompt).toContain('objection about price')
  })

  it('includes the rep question text verbatim', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', '', 'What criteria do you look for when choosing a medication here?')
    expect(prompt).toContain('What criteria do you look for when choosing a medication here?')
  })

  it('describes all five question types including the catch-all', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', '', 'question')
    expect(prompt).toContain('"forbidden_reason"')
    expect(prompt).toContain('rehearse and reinforce')
    expect(prompt).toContain('"forbidden_indication"')
    expect(prompt).toContain('puts you on the spot')
    expect(prompt).toContain('"effective_challenges"')
    expect(prompt).toContain('challenges or problems')
    expect(prompt).toContain('"effective_criteria"')
    expect(prompt).toContain('criteria or factors')
    expect(prompt).toContain('"other"')
  })

  it('asks for a JSON response with doctorText and questionType', () => {
    const prompt = buildQuestionJudgePrompt(doctorFixture(), 'driver', 'en', '', 'question')
    expect(prompt).toContain('"doctorText"')
    expect(prompt).toContain('"questionType"')
  })
})

describe('parseQuestionJudgeResponse', () => {
  it('parses a valid response', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"Good question.","questionType":"effective_criteria"}')).toEqual({
      doctorText: 'Good question.', questionType: 'effective_criteria',
    })
  })

  it('strips surrounding commentary/markdown fences', () => {
    expect(parseQuestionJudgeResponse('```json\n{"doctorText":"Hmm.","questionType":"other"}\n```')).toEqual({
      doctorText: 'Hmm.', questionType: 'other',
    })
  })

  it('returns null for malformed JSON', () => {
    expect(parseQuestionJudgeResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"","questionType":"other"}')).toBeNull()
    expect(parseQuestionJudgeResponse('{"questionType":"other"}')).toBeNull()
  })

  it('returns null when questionType is missing (strict, not defaulted)', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"Answer."}')).toBeNull()
  })

  it('returns null when questionType is invalid (strict, not defaulted)', () => {
    expect(parseQuestionJudgeResponse('{"doctorText":"Answer.","questionType":"made_up"}')).toBeNull()
  })
})

describe('buildListeningJudgePrompt', () => {
  it('includes the turn-1 exchange and the rep turn-2 response', () => {
    const prompt = buildListeningJudgePrompt(
      doctorFixture(), 'driver', 'en', '',
      'What challenges do your patients face?', 'Adherence is a big one.', 'effective_challenges',
      'So adherence is the main challenge you see?',
    )
    expect(prompt).toContain('What challenges do your patients face?')
    expect(prompt).toContain('Adherence is a big one.')
    expect(prompt).toContain('So adherence is the main challenge you see?')
  })

  it('interpolates the questionType into the earlier-exchange context', () => {
    const prompt = buildListeningJudgePrompt(
      doctorFixture(), 'driver', 'en', '',
      'What challenges do your patients face?', 'Adherence is a big one.', 'effective_challenges',
      'So adherence is the main challenge you see?',
    )
    expect(prompt).toContain('effective_challenges')
  })

  it('describes all three listening cues including the last-few-words technique', () => {
    const prompt = buildListeningJudgePrompt(doctorFixture(), 'driver', 'en', '', 'q', 'a', 'other', 'reply')
    expect(prompt).toContain('"restated"')
    expect(prompt).toContain('repeating your last few words')
    expect(prompt).toContain('"paraphrased"')
    expect(prompt).toContain('"validatedFeelings"')
  })

  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildListeningJudgePrompt(doctorFixture(), 'analytical', 'en', '', 'q', 'a', 'other', 'reply')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })
})

describe('parseListeningJudgeResponse', () => {
  it('parses a valid response', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Yes, exactly.","listeningCuesHit":["restated","validatedFeelings"]}')).toEqual({
      doctorText: 'Yes, exactly.', listeningCuesHit: ['restated', 'validatedFeelings'],
    })
  })

  it('returns null for malformed JSON', () => {
    expect(parseListeningJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"","listeningCuesHit":[]}')).toBeNull()
  })

  it('defaults listeningCuesHit to an empty array when missing', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Ok."}')).toEqual({ doctorText: 'Ok.', listeningCuesHit: [] })
  })

  it('defaults listeningCuesHit to an empty array when not an array', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Ok.","listeningCuesHit":"restated"}')).toEqual({ doctorText: 'Ok.', listeningCuesHit: [] })
  })

  it('filters out unknown strings from listeningCuesHit', () => {
    expect(parseListeningJudgeResponse('{"doctorText":"Ok.","listeningCuesHit":["restated","made_up","paraphrased"]}')).toEqual({
      doctorText: 'Ok.', listeningCuesHit: ['restated', 'paraphrased'],
    })
  })
})
