import { describe, it, expect } from 'vitest'
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  type VoicePartnerTurn,
} from './voice-partner-core'

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

describe('buildOpeningPrompt', () => {
  it('includes the doctor name, style drive, and language', () => {
    const prompt = buildOpeningPrompt('Dr. Amina', 'analytical', 'en', '')
    expect(prompt).toContain('Dr. Amina')
    expect(prompt).toContain('Certainty & Accuracy')
    expect(prompt).toContain('English')
  })

  it('includes visit history context when provided', () => {
    const prompt = buildOpeningPrompt('Dr. Amina', 'driver', 'en', 'Past visit history with this doctor: objection about price')
    expect(prompt).toContain('objection about price')
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
    const prompt = buildJudgePrompt('Dr. Amina', 'driver', 'en', '', turns, 'It pays for itself within a month.', 1)
    expect(prompt).toContain('Doctor: Your product costs too much.')
    expect(prompt).toContain('It pays for itself within a month.')
    expect(prompt).toContain(`rep reply #1 of a maximum ${TURN_CAP}`)
  })

  it('marks the opening turn explicitly when there is no prior transcript', () => {
    const prompt = buildJudgePrompt('Dr. Amina', 'driver', 'en', '', [], 'first reply', 1)
    expect(prompt).toContain('the rep has not spoken yet')
  })
})

describe('parseJudgeResponse', () => {
  it('parses a valid verdict + reply', () => {
    const parsed = parseJudgeResponse('{"verdict":"continue","doctorReply":"Convince me further."}')
    expect(parsed).toEqual({ verdict: 'continue', doctorReply: 'Convince me further.' })
  })

  it('accepts win and escalate verdicts', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":"Fair enough."}')?.verdict).toBe('win')
    expect(parseJudgeResponse('{"verdict":"escalate","doctorReply":"Not interested."}')?.verdict).toBe('escalate')
  })

  it('returns null for an invalid verdict value', () => {
    expect(parseJudgeResponse('{"verdict":"maybe","doctorReply":"..."}')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorReply is missing or empty', () => {
    expect(parseJudgeResponse('{"verdict":"win","doctorReply":""}')).toBeNull()
  })
})
