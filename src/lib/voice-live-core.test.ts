import { describe, expect, it } from 'vitest'
import { shouldSkipJudge, buildLiveJudgePrompt, parseLiveJudgeResponse, transcriptToConversationTurns, type LiveTranscriptTurn } from './voice-live-core'
import type { Doctor } from '@/types/game'

const doctor: Doctor = {
  id: 'd1', rep_id: 'r1', name: 'Dr. Sara', specialty: 'cardiology', style: 'driver',
  key_phrases: null, objections: ['too busy'], objection_notes: null, hidden_concern: null,
  product_context: null, meeting_stage: null, created_at: '', updated_at: '',
} as unknown as Doctor

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
