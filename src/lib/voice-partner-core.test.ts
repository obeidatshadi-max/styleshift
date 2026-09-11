import { describe, it, expect } from 'vitest'
import {
  TURN_CAP, buildOpeningPrompt, parseOpeningResponse,
  buildJudgePrompt, parseJudgeResponse, resolveTurn,
  pickObjectionType, computeObjectionWeights, isObjectionType, OBJECTION_TYPES,
  isSpecialty, SPECIALTY_CONTEXT,
  seedPhysicianState, applyStateDelta, isPhysicianState, isDifficulty, DIFFICULTY_LEVELS,
  type VoicePartnerTurn, type ObjectionType, type PhysicianState,
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
  false_objection: 'not a real reason',
}

describe('resolveTurn', () => {
  it('resolves "won" whenever the persona state is satisfied, regardless of turn count', () => {
    expect(resolveTurn(1, 'satisfied')).toBe('won')
    expect(resolveTurn(5, 'satisfied')).toBe('won')
  })

  it('resolves "escalated" whenever the persona state is disengaged', () => {
    expect(resolveTurn(1, 'disengaged')).toBe('escalated')
  })

  it('resolves "continue" when the persona is still resistant and the turn cap is not reached', () => {
    expect(resolveTurn(1, 'resistant')).toBe('continue')
    expect(resolveTurn(TURN_CAP - 1, 'resistant')).toBe('continue')
  })

  it('forces "escalated" when the persona is still resistant but the turn cap is reached', () => {
    expect(resolveTurn(TURN_CAP, 'resistant')).toBe('escalated')
    expect(resolveTurn(TURN_CAP + 1, 'resistant')).toBe('escalated')
  })
})

describe('pickObjectionType', () => {
  it('always returns one of the five valid objection types', () => {
    for (let i = 0; i < 50; i++) {
      expect(OBJECTION_TYPES).toContain(pickObjectionType())
    }
  })

  it('always returns a valid type even with a full recent-outcomes history', () => {
    const recent = OBJECTION_TYPES.map(t => ({ objectionType: t, outcome: 'won' as const }))
    for (let i = 0; i < 20; i++) {
      expect(OBJECTION_TYPES).toContain(pickObjectionType(recent))
    }
  })
})

describe('computeObjectionWeights', () => {
  it('gives every type equal weight with no history', () => {
    const weights = computeObjectionWeights()
    for (const t of OBJECTION_TYPES) expect(weights[t]).toBe(1)
  })

  it('lowers the weight of a type the rep has already won against', () => {
    const weights = computeObjectionWeights([{ objectionType: 'doubt', outcome: 'won' }])
    expect(weights.doubt).toBeLessThan(1)
    expect(weights.wrong_info).toBe(1)
  })

  it('does not lower weight for an escalated (unresolved) outcome', () => {
    const weights = computeObjectionWeights([{ objectionType: 'doubt', outcome: 'escalated' }])
    expect(weights.doubt).toBe(1)
  })

  it('floors a repeatedly-won type at 0.15 rather than zeroing it out', () => {
    const recent = Array.from({ length: 5 }, () => ({ objectionType: 'doubt' as const, outcome: 'won' as const }))
    const weights = computeObjectionWeights(recent)
    expect(weights.doubt).toBe(0.15)
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

describe('isSpecialty', () => {
  it('accepts each of the 8 curated specialty keys', () => {
    for (const key of Object.keys(SPECIALTY_CONTEXT)) expect(isSpecialty(key)).toBe(true)
  })

  it('rejects legacy free-text values, other strings, and non-strings', () => {
    expect(isSpecialty('Cardiology')).toBe(false) // display label, not the key
    expect(isSpecialty('made_up')).toBe(false)
    expect(isSpecialty(null)).toBe(false)
    expect(isSpecialty(undefined)).toBe(false)
    expect(isSpecialty(123)).toBe(false)
  })
})

describe('isDifficulty', () => {
  it('accepts each of the four difficulty levels', () => {
    for (const level of DIFFICULTY_LEVELS) expect(isDifficulty(level)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isDifficulty('brutal')).toBe(false)
    expect(isDifficulty(undefined)).toBe(false)
  })
})

describe('seedPhysicianState', () => {
  it('seeds a neutral realistic-difficulty doctor at the midpoint', () => {
    const state = seedPhysicianState(doctorFixture(), 'realistic')
    expect(state).toEqual({ trust: 50, skepticism: 50, engagement: 50, timePressure: 30 })
  })

  it('makes a supportive session start friendlier than a pressure_test session', () => {
    const supportive = seedPhysicianState(doctorFixture(), 'supportive')
    const pressureTest = seedPhysicianState(doctorFixture(), 'pressure_test')
    expect(supportive.trust).toBeGreaterThan(pressureTest.trust)
    expect(supportive.skepticism).toBeLessThan(pressureTest.skepticism)
    expect(supportive.engagement).toBeGreaterThan(pressureTest.engagement)
    expect(supportive.timePressure).toBeLessThan(pressureTest.timePressure)
  })

  it('lowers starting trust for a "tell" doctor and raises skepticism for a "controls" doctor', () => {
    const base = seedPhysicianState(doctorFixture(), 'realistic')
    const tell = seedPhysicianState(doctorFixture({ assertiveness: 'tell' }), 'realistic')
    const controls = seedPhysicianState(doctorFixture({ responsiveness: 'controls' }), 'realistic')
    expect(tell.trust).toBeLessThan(base.trust)
    expect(controls.skepticism).toBeGreaterThan(base.skepticism)
  })

  it('never produces a value outside 0..100', () => {
    for (const level of DIFFICULTY_LEVELS) {
      const state = seedPhysicianState(doctorFixture({ assertiveness: 'tell', responsiveness: 'controls' }), level)
      for (const v of Object.values(state)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
    }
  })
})

describe('applyStateDelta', () => {
  const base: PhysicianState = { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 }

  it('applies each delta and leaves timePressure untouched', () => {
    const next = applyStateDelta(base, { trustDelta: 5, skepticismDelta: -5, engagementDelta: 3 })
    expect(next).toEqual({ trust: 55, skepticism: 45, engagement: 53, timePressure: 30 })
  })

  it('clamps the result to 0..100 at the boundaries', () => {
    expect(applyStateDelta({ ...base, trust: 98 }, { trustDelta: 10, skepticismDelta: 0, engagementDelta: 0 }).trust).toBe(100)
    expect(applyStateDelta({ ...base, trust: 2 }, { trustDelta: -10, skepticismDelta: 0, engagementDelta: 0 }).trust).toBe(0)
  })

  it('clamps an out-of-range delta itself to -10..10 before applying it', () => {
    const next = applyStateDelta(base, { trustDelta: 999, skepticismDelta: -999, engagementDelta: 0 })
    expect(next.trust).toBe(60)
    expect(next.skepticism).toBe(40)
  })
})

describe('isPhysicianState', () => {
  it('accepts a well-formed state object', () => {
    expect(isPhysicianState({ trust: 50, skepticism: 50, engagement: 50, timePressure: 30 })).toBe(true)
  })

  it('rejects missing fields, out-of-range values, and non-objects', () => {
    expect(isPhysicianState({ trust: 50, skepticism: 50, engagement: 50 })).toBe(false)
    expect(isPhysicianState({ trust: 150, skepticism: 50, engagement: 50, timePressure: 30 })).toBe(false)
    expect(isPhysicianState(null)).toBe(false)
    expect(isPhysicianState('nope')).toBe(false)
  })
})

describe('personaLines via buildOpeningPrompt — specialty domain-flavor', () => {
  it('includes the specialty display label and its domain-flavor text when specialty is a recognized key', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: 'cardiology' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Cardiology')
    expect(prompt).toContain('cardiovascular risk')
  })

  it('renders a different domain flavor for a different specialty', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: 'pediatrics' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Pediatrics')
    expect(prompt).toContain('dosing across different ages/weights')
  })

  it('falls back to the raw stored value with no domain-flavor line for an unrecognized legacy specialty', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: 'Cardiology' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('Cardiology')
    expect(prompt).not.toContain('cardiovascular risk')
  })

  it('omits any domain-flavor line and does not error when specialty is null', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ specialty: null }), 'analytical', 'en', '', 'doubt')
    expect(prompt).not.toContain('cardiovascular risk')
    expect(prompt).not.toContain('dosing across different ages/weights')
  })
})

describe('personaLines — weighted style blend (1.4)', () => {
  it('uses the legacy single-style line when no weight columns are set', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('a analytical customer (core drive: Certainty & Accuracy)')
  })

  it('describes a weighted blend when weight columns are present, ordered by share', () => {
    const prompt = buildOpeningPrompt(
      doctorFixture({ style_analytical: 0.6, style_driver: 0.4, style_expressive: 0, style_amiable: 0 }),
      'analytical', 'en', '', 'doubt',
    )
    expect(prompt).toContain('primarily a analytical customer')
    expect(prompt).toContain('60% analytical')
    expect(prompt).toContain('40% driver')
  })

  it('falls back to the legacy line when all weights are zero', () => {
    const prompt = buildOpeningPrompt(
      doctorFixture({ style_analytical: 0, style_driver: 0, style_expressive: 0, style_amiable: 0 }),
      'analytical', 'en', '', 'doubt',
    )
    expect(prompt).toContain('a analytical customer (core drive: Certainty & Accuracy)')
  })
})

describe('personaLines — hidden concern (1.5)', () => {
  it('states the private concern with an explicit never-reveal-directly instruction', () => {
    const prompt = buildOpeningPrompt(doctorFixture({ hidden_concern: 'worried about losing a loyal patient base' }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('worried about losing a loyal patient base')
    expect(prompt).toContain('must NEVER state directly')
  })

  it('omits the hidden-concern line entirely when none is set', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).not.toContain('underlying concern')
  })

  it('adds a reveal instruction on the judge prompt only when clarifyUnlocked is true', () => {
    const turns: VoicePartnerTurn[] = []
    const doctor = doctorFixture({ hidden_concern: 'fears losing a loyal patient base' })
    const locked = buildJudgePrompt(doctor, 'analytical', 'en', '', turns, 'reply', 1, 'doubt', undefined, false)
    const unlocked = buildJudgePrompt(doctor, 'analytical', 'en', '', turns, 'reply', 1, 'doubt', undefined, true)
    expect(locked).not.toContain('let a little of your true underlying concern')
    expect(unlocked).toContain('let a little of your true underlying concern')
  })
})

describe('personaLines — scenario context (1.8)', () => {
  it('includes product context, meeting stage, and available time when set', () => {
    const prompt = buildOpeningPrompt(doctorFixture({
      product_context: 'a new once-daily formulation', meeting_stage: 'first detail', available_time_min: 5,
    }), 'analytical', 'en', '', 'doubt')
    expect(prompt).toContain('a new once-daily formulation')
    expect(prompt).toContain('first detail')
    expect(prompt).toContain('about 5 minutes')
  })

  it('omits the scenario-context line entirely when none of the fields are set', () => {
    const prompt = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(prompt).not.toContain('Meeting stage')
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

  it('includes the internal state block (never-reveal instruction and the state values) only when state is passed', () => {
    const withState = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt', { trust: 40, skepticism: 60, engagement: 50, timePressure: 30 })
    const withoutState = buildOpeningPrompt(doctorFixture(), 'analytical', 'en', '', 'doubt')
    expect(withState).toContain('never reveal these numbers')
    expect(withState).toContain('trust 40/100')
    expect(withoutState).not.toContain('never reveal these numbers')
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

  it('describes the "listen" step as covering paraphrase, reflection, or repeating back key words', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'reply', 1, 'doubt')
    expect(prompt).toContain('repeated the last few words')
  })

  it('asks for personaState and stateDelta instead of a performance verdict', () => {
    const prompt = buildJudgePrompt(doctorFixture(), 'driver', 'en', '', turns, 'reply', 1, 'doubt')
    expect(prompt).toContain('"personaState"')
    expect(prompt).toContain('"stateDelta"')
    expect(prompt).not.toContain('"verdict"')
  })
})

describe('parseJudgeResponse', () => {
  it('parses a valid personaState + reply with clearSteps and stateDelta', () => {
    const parsed = parseJudgeResponse('{"personaState":"resistant","doctorReply":"Convince me further.","clearSteps":["listen","empathy"],"stateDelta":{"trustDelta":2,"skepticismDelta":-3,"engagementDelta":1}}')
    expect(parsed).toEqual({
      personaState: 'resistant', doctorReply: 'Convince me further.', clearSteps: ['listen', 'empathy'],
      stateDelta: { trustDelta: 2, skepticismDelta: -3, engagementDelta: 1 },
    })
  })

  it('accepts satisfied and disengaged persona states', () => {
    expect(parseJudgeResponse('{"personaState":"satisfied","doctorReply":"Fair enough.","clearSteps":[]}')?.personaState).toBe('satisfied')
    expect(parseJudgeResponse('{"personaState":"disengaged","doctorReply":"Not interested.","clearSteps":[]}')?.personaState).toBe('disengaged')
  })

  it('returns null for an invalid personaState value', () => {
    expect(parseJudgeResponse('{"personaState":"maybe","doctorReply":"...","clearSteps":[]}')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseJudgeResponse('garbage')).toBeNull()
  })

  it('returns null when doctorReply is missing or empty', () => {
    expect(parseJudgeResponse('{"personaState":"satisfied","doctorReply":"","clearSteps":[]}')).toBeNull()
  })

  it('defaults clearSteps to an empty array when missing', () => {
    expect(parseJudgeResponse('{"personaState":"satisfied","doctorReply":"Fair enough."}')).toEqual({
      personaState: 'satisfied', doctorReply: 'Fair enough.', clearSteps: [], stateDelta: { trustDelta: 0, skepticismDelta: 0, engagementDelta: 0 },
    })
  })

  it('defaults clearSteps to an empty array when not an array', () => {
    expect(parseJudgeResponse('{"personaState":"satisfied","doctorReply":"Fair enough.","clearSteps":"listen"}')).toEqual({
      personaState: 'satisfied', doctorReply: 'Fair enough.', clearSteps: [], stateDelta: { trustDelta: 0, skepticismDelta: 0, engagementDelta: 0 },
    })
  })

  it('filters out unknown strings from clearSteps', () => {
    expect(parseJudgeResponse('{"personaState":"satisfied","doctorReply":"Fair enough.","clearSteps":["listen","made_up","empathy"]}')).toEqual({
      personaState: 'satisfied', doctorReply: 'Fair enough.', clearSteps: ['listen', 'empathy'], stateDelta: { trustDelta: 0, skepticismDelta: 0, engagementDelta: 0 },
    })
  })

  it('defaults stateDelta to all zeros when missing, and clamps out-of-range values', () => {
    expect(parseJudgeResponse('{"personaState":"resistant","doctorReply":"x","stateDelta":{"trustDelta":999,"skepticismDelta":-999,"engagementDelta":"nope"}}')).toEqual({
      personaState: 'resistant', doctorReply: 'x', clearSteps: [], stateDelta: { trustDelta: 10, skepticismDelta: -10, engagementDelta: 0 },
    })
  })
})
