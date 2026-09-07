import { describe, it, expect } from 'vitest'
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  pickObjectionType, isObjectionType, OBJECTION_TYPES,
  type VoicePartnerTurn, type ObjectionType,
} from './voice-partner-core'
import type { Doctor } from '@/types/game'

/** A minimal Digital Twin doctor; `over` supplies the persona fields under test. */
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

const OBJECTION_KEYWORD: Record<ObjectionType, string> = {
  wrong_info: 'mistaken belief',
  doubt: 'skepticism about whether',
  true_objection: 'real, legitimate concern',
  indifference: 'low engagement',
}

describe('resolveTurn', () => {
  it('resolves "won" whenever the model verdict is win, regardless of turn count', () => {
    expect(resolveTurn(1, 'win')).toBe('won')
    expect(resolveTurn(5, 'win')).toBe('won')
  })

  it('resolves "escalated" whenever the model verdict is escalate', () => {
    expect(resolveTurn(1, 'escalate')).toBe('escalated')
  })

  it('resolves "continue" when the model says continue and the turn cap is not reached', () => {
    expect(resolveTurn(1, 'continue')).toBe('continue')
    expect(resolveTurn(TURN_CAP - 1, 'continue')).toBe('continue')
  })

  it('forces "escalated" when the model says continue but the turn cap is reached', () => {
    expect(resolveTurn(TURN_CAP, 'continue')).toBe('escalated')
    expect(resolveTurn(TURN_CAP + 1, 'continue')).toBe('escalated')
  })
})

describe('pickObjectionType', () => {
  it('always returns one of the four valid objection types', () => {
    for (let i = 0; i < 50; i++) {
      expect(OBJECTION_TYPES).toContain(pickObjectionType())
    }
  })
})

describe('isObjectionType', () => {
  it('accepts each valid objection type', () => {
    for (const type of OBJECTION_TYPES) expect(isObjectionType(type)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isObjectionType('made_up')).toBe(false)
    expect(isObjectionType(123)).toBe(false)
    expect(isObjectionType(undefined)).toBe(false)
  })
})

describe('buildOpeningPrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'driver', 'en', 'Past visit history with this doctor: objection about price', 'doubt')
    expect(prompt).toContain('objection about price')
  })

  it('includes the specialty, key phrases, and objections when the doctor has them', () => {
    const prompt = buildOpeningPrompt(doctorFixture({
      specialty: 'Cardiology',
      key_phrases: 'Show me the data first',
      objections: ['price', 'formulary access'],
    }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Cardiology')
    expect(prompt).toContain('Show me the data first')
    expect(prompt).toContain('price, formulary access')
  })

  it('omits the persona lines entirely when key phrases and objections are empty', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).not.toContain('They often say things like')
    expect(prompt).not.toContain('Objection theme(s)')
  })

  it.each(OBJECTION_TYPES)('includes the type-specific instruction for %s', (type) => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', type)
    expect(prompt).toContain(OBJECTION_KEYWORD[type])
  })
})

describe('parseOpeningResponse', () => {
  it('parses a valid JSON opening line', () => {
    expect(parseOpeningResponse('{"doctorText":"Your product costs too much."}')).toBe('Your product costs too much.')
  })

  it('strips surrounding commentary/markdown fences', () => {
    expect(parseOpeningResponse('```json\n{"doctorText":"Too expensive."}\n```')).toBe('Too expensive.')
  })

  it('returns null for malformed JSON', () => {
    expect(parseOpeningResponse('not json at all')).toBeNull()
  })

  it('returns null when doctorText is missing or empty', () => {
    expect(parseOpeningResponse('{"doctorText":""}')).toBeNull()
    expect(parseOpeningResponse('{}')).toBeNull()
  })
})

describe('buildJudgePrompt', () => {
  const turns: VoicePartnerTurn[] = [{ role: 'doctor', text: 'Your product costs too much.' }]

  it('includes the transcript so far, the new rep reply, and the turn count/cap', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'It pays for itself within a month.', 1, 'doubt')
    expect(prompt).toContain('Doctor: Your product costs too much.')
    expect(prompt).toContain('It pays for itself within a month.')
    expect(prompt).toContain(`rep reply #1 of a maximum ${TURN_CAP}`)
  })

  it('marks the opening turn explicitly when there is no prior transcript', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', [], 'first reply', 1, 'doubt')
    expect(prompt).toContain('the rep has not spoken yet')
  })

  it('includes the specialty, key phrases, and objections when the doctor has them', () => {
    const prompt = buildJudgePrompt(doctorFixture({
      specialty: 'Oncology',
      key_phrases: 'Get to the point',
      objections: ['switching cost'],
    }), 'driver', 'ar', '', turns, 'reply', 1, 'doubt')
    expect(prompt).toContain('Oncology')
    expect(prompt).toContain('Get to the point')
    expect(prompt).toContain('switching cost')
    expect(prompt).toContain('Arabic')
  })

  it.each(OBJECTION_TYPES)('includes the type-specific instruction for %s', (type) => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'reply', 1, type)
    expect(prompt).toContain(OBJECTION_KEYWORD[type])
  })

  it('asks the model to identify CLEAR steps demonstrated', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'reply', 1, 'doubt')
    expect(prompt).toContain('clearSteps')
    expect(prompt).toContain('"clarify"')
    expect(prompt).toContain('"recheck"')
  })
})

describe('parseJudgeResponse', () => {
  it('parses a valid verdict + reply with clearSteps', () => {
    const parsed = parseJudgeResponse('{"verdict":"continue","doctorReply":"Convince me further.","clearSteps":["listen","empathy"]}')
    expect(parsed).toEqual({ verdict: 'continue', doctorReply: 'Convince me further.', clearSteps: ['listen', 'empathy'] })
  })

  it('accepts win and escalate verdicts', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough.","clearSteps":[]}')?.verdict).toBe('win')
    expect(parseJudgeResponse('{"verdict":"escalate","doctorReply":"Not interested.","clearSteps":[]}')?.verdict).toBe('escalate')
  })

  it('returns null for an invalid verdict value', () => {
    expect(parseJudgeResponse('{"verdict":"maybe","doctorReply":"...","clearSteps":[]}')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorReply is missing or empty', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"","clearSteps":[]}')).toBeNull()
  })

  it('defaults clearSteps to an empty array when missing', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough."}')).toEqual({
      verdict: 'win', doctorReply: 'Fair enough.', clearSteps: [],
    })
  })

  it('defaults clearSteps to an empty array when not an array', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough.","clearSteps":"listen"}')).toEqual({
      verdict: 'win', doctorReply: 'Fair enough.', clearSteps: [],
    })
  })

  it('filters out unknown strings from clearSteps', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough.","clearSteps":["listen","made_up","empathy"]}')).toEqual({
      verdict: 'win', doctorReply: 'Fair enough.', clearSteps: ['listen', 'empathy'],
    })
  })
})
