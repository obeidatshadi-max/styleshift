import { describe, expect, it } from 'vitest'
import { shouldSkipJudge, buildLiveJudgePrompt, parseLiveJudgeResponse, transcriptToConversationTurns, LIVE_DIFFICULTY_LEVELS, DEFAULT_LIVE_DIFFICULTY, isLiveDifficulty, persistableDifficulty, type LiveTranscriptTurn } from './voice-live-core'
import { DIFFICULTY_LEVELS } from './voice-partner-core'
import type { Doctor } from '@/types/game'

const doctor: Doctor = {
  id: 'd1', rep_id: 'r1', name: 'Dr. Sara', specialty: 'cardiology', style: 'driver',
  key_phrases: null, objections: ['too busy'], objection_notes: null, hidden_concern: null,
  product_context: null, meeting_stage: null, created_at: '', updated_at: '',
} as unknown as Doctor

describe('live difficulty vocabulary', () => {
  it('matches exactly what /api/pipecat/session and the Pipecat agent accept', () => {
    expect([...LIVE_DIFFICULTY_LEVELS]).toEqual(['supportive', 'realistic', 'challenging'])
    expect(LIVE_DIFFICULTY_LEVELS).toContain(DEFAULT_LIVE_DIFFICULTY)
  })
  it('is decoupled from the turn-based set — neither is a subset of the other', () => {
    const turnBased = DIFFICULTY_LEVELS as readonly string[]
    // The levels the live agent cannot run, and must never be offered here.
    expect(turnBased).toContain('resistant')
    expect([...LIVE_DIFFICULTY_LEVELS]).not.toContain('resistant')
    expect([...LIVE_DIFFICULTY_LEVELS]).not.toContain('pressure_test')
    // The level only the live agent has, which the turn-based picker hid.
    expect(turnBased).not.toContain('challenging')
  })
  it('validates only live levels', () => {
    for (const level of LIVE_DIFFICULTY_LEVELS) expect(isLiveDifficulty(level)).toBe(true)
    for (const level of ['resistant', 'pressure_test', '', 'REALISTIC', null, 7]) expect(isLiveDifficulty(level)).toBe(false)
  })
})

describe('persistableDifficulty', () => {
  // voice_partner_sessions.difficulty CHECK (migration 026) allows only the
  // turn-based set, so 'challenging' must be dropped rather than sent.
  it('passes through the levels the sessions table can hold', () => {
    expect(persistableDifficulty('supportive')).toBe('supportive')
    expect(persistableDifficulty('realistic')).toBe('realistic')
  })
  it('drops the live-only level the column has no value for', () => {
    expect(persistableDifficulty('challenging')).toBeUndefined()
  })
  it('only ever returns a value the shared column accepts', () => {
    const turnBased = DIFFICULTY_LEVELS as readonly string[]
    for (const level of LIVE_DIFFICULTY_LEVELS) {
      const persisted = persistableDifficulty(level)
      if (persisted !== undefined) expect(turnBased).toContain(persisted)
    }
  })
})

describe('shouldSkipJudge', () => {
  it('skips when no rep turns exist', () => {
    expect(shouldSkipJudge([])).toBe(true)
    expect(shouldSkipJudge([{ role: 'doctor', text: 'Hi' }])).toBe(true)
  })
  it('does not skip once the rep has spoken', () => {
    expect(shouldSkipJudge([{ role: 'doctor', text: 'Hi' }, { role: 'rep', text: 'Hello doctor' }])).toBe(false)
  })
})

describe('buildLiveJudgePrompt', () => {
  it('includes the full transcript and both objection-type and clear-step instructions', () => {
    const transcript: LiveTranscriptTurn[] = [
      { role: 'doctor', text: 'I am too busy for this.' },
      { role: 'rep', text: 'I understand — what specifically is eating your time?' },
    ]
    const prompt = buildLiveJudgePrompt(doctor, 'driver', 'en', transcript)
    expect(prompt).toContain('Doctor: I am too busy for this.')
    expect(prompt).toContain('Rep: I understand — what specifically is eating your time?')
    expect(prompt).toContain('wrong_info')
    expect(prompt).toContain('"clarify"')
    expect(prompt).toContain('"objectionType"')
  })
  it('marks an empty transcript explicitly rather than rendering blank', () => {
    expect(buildLiveJudgePrompt(doctor, 'driver', 'en', [])).toContain('(no conversation recorded)')
  })
})

describe('parseLiveJudgeResponse', () => {
  it('parses a well-formed response', () => {
    const text = '{"objectionType":"doubt","outcome":"won","clearSteps":["listen","answer"]}'
    expect(parseLiveJudgeResponse(text)).toEqual({ objectionType: 'doubt', outcome: 'won', clearSteps: ['listen', 'answer'] })
  })
  it('filters invalid clearSteps entries rather than rejecting the whole response', () => {
    const text = '{"objectionType":"doubt","outcome":"won","clearSteps":["listen","bogus"]}'
    expect(parseLiveJudgeResponse(text)).toEqual({ objectionType: 'doubt', outcome: 'won', clearSteps: ['listen'] })
  })
  it('rejects an invalid objectionType or outcome', () => {
    expect(parseLiveJudgeResponse('{"objectionType":"bogus","outcome":"won","clearSteps":[]}')).toBeNull()
    expect(parseLiveJudgeResponse('{"objectionType":"doubt","outcome":"maybe","clearSteps":[]}')).toBeNull()
  })
  it('rejects malformed JSON', () => {
    expect(parseLiveJudgeResponse('not json')).toBeNull()
  })
})

describe('transcriptToConversationTurns', () => {
  it('maps each transcript entry to an indexed row with the shared objectionType', () => {
    const transcript: LiveTranscriptTurn[] = [
      { role: 'doctor', text: 'Too busy.' },
      { role: 'rep', text: 'Understood.' },
    ]
    const rows = transcriptToConversationTurns(transcript, { sessionId: 's1', repId: 'r1', doctorId: 'd1', objectionType: 'indifference' })
    expect(rows).toEqual([
      { session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0, role: 'doctor', text: 'Too busy.', objection_type: 'indifference', clear_steps_hit: [] },
      { session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 1, role: 'rep', text: 'Understood.', objection_type: 'indifference', clear_steps_hit: [] },
    ])
  })
})
