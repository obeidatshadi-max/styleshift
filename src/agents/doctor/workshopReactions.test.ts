import { describe, it, expect } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { analyzeRepTurn, repTurnToDelta } from './behavior'
import { buildDoctorReplyPrompt, buildDoctorOpeningPrompt } from './prompt'
import { applyStateDelta } from '@/lib/voice-partner-core'

const first = { firstRepTurn: true }
const state = { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 }

describe('workshop detectors', () => {
  it('flags the two questions the workshop says to avoid, in English and Arabic', () => {
    expect(analyzeRepTurn('Why do you prescribe the older drug for these patients?').forbiddenQuestion).toBe(true)
    expect(analyzeRepTurn('What do you prescribe in this indication?').forbiddenQuestion).toBe(true)
    expect(analyzeRepTurn('ليش تكتب هذا الدواء؟').forbiddenQuestion).toBe(true)
    expect(analyzeRepTurn('Why do you think patients stop treatment?').forbiddenQuestion).toBe(false)
  })
  it('recognises the two effective questions', () => {
    expect(analyzeRepTurn('What criteria do you look for when you choose a treatment for these patients?').criteriaQuestion).toBe(true)
    expect(analyzeRepTurn('What challenges do your patients face with their current treatment?').criteriaQuestion).toBe(true)
    expect(analyzeRepTurn('شنو المعايير اللي تعتمدها؟').criteriaQuestion).toBe(true)
    expect(analyzeRepTurn('Do you prescribe it?').criteriaQuestion).toBe(false)
  })
  it('tells a product-first opening from a patient-first one, only on the first rep turn', () => {
    expect(analyzeRepTurn('Today I want to talk to you about our new product.', first).productFirstOpening).toBe(true)
    expect(analyzeRepTurn('Many of your elderly patients take five medicines a day.', first)).toMatchObject({ problemFirstOpening: true, productFirstOpening: false })
    expect(analyzeRepTurn('Today I want to talk to you about our new product.').productFirstOpening).toBe(false)
  })
  it('detects labeling, mirroring and an acknowledgement undone by "but"', () => {
    expect(analyzeRepTurn('It sounds like side effects worry you most.').labeledFeeling).toBe(true)
    expect(analyzeRepTurn('Side effects?', { lastDoctorText: 'I am worried about side effects.' }).mirrored).toBe(true)
    expect(analyzeRepTurn('Let me explain the full safety profile of the product in detail now.', { lastDoctorText: 'I am worried about side effects.' }).mirrored).toBe(false)
    expect(analyzeRepTurn('I understand, but our data is strong.').usedBut).toBe(true)
    expect(analyzeRepTurn('I understand, and our data is strong.').usedBut).toBe(false)
  })
})

describe('doctor feelings and prompt', () => {
  it('rewards patient-focused discovery without automatically penalizing a prescribing question', () => {
    const warm = repTurnToDelta(analyzeRepTurn('What challenges do your patients face with their current treatment?', first))
    const cold = repTurnToDelta(analyzeRepTurn('Why do you prescribe that one?', first))
    expect(warm.engagementDelta).toBeGreaterThan(cold.engagementDelta)
    expect(warm.trustDelta).toBeGreaterThan(0)
    expect(cold.trustDelta).toBeGreaterThanOrEqual(0)
    expect(repTurnToDelta(analyzeRepTurn('I understand, but our data is strong.')).trustDelta).toBeLessThan(0)
  })
  it('keeps stacked effects inside the engine range', () => {
    const stacked = repTurnToDelta(analyzeRepTurn('What criteria do you look for? It sounds like patients worry you.', first))
    const next = applyStateDelta(state, stacked)
    expect(next.trust - state.trust).toBeLessThanOrEqual(10)
    expect(next.engagement - state.engagement).toBeLessThanOrEqual(10)
  })
  it('puts a felt reaction, never feedback, into the doctor prompt', () => {
    const s = createEmptySession('s1', 'r1')
    const text = 'Why do you prescribe that one?'
    const prompt = buildDoctorReplyPrompt(s, text, analyzeRepTurn(text, first), state)
    expect(prompt).toContain('answer respectful curiosity with your criteria')
    expect(prompt).not.toMatch(/forbidden|mistake|should have/i)
  })
  it('does not award trust merely for naming an unexpressed feeling', () => {
    for (const text of ['It sounds like you are anxious.', 'يبدو أنك قلق.']) {
      const shape = analyzeRepTurn(text)
      expect(shape.labeledFeeling).toBe(true)
      expect(repTurnToDelta(shape)).toEqual({ trustDelta: 0, skepticismDelta: 0, engagementDelta: 0 })
      const prompt = buildDoctorReplyPrompt(createEmptySession('s1', 'r1'), text, shape, state)
      expect(prompt).toContain('otherwise correct it naturally')
    }
  })
})

describe('precision questions (Structure of Magic)', () => {
  it('recognises questions that ask the doctor to be specific', () => {
    for (const q of [
      'Which patients, specifically?', 'What exactly happened with them?', 'Better compared with what?',
      'What stops you from trying it in new patients?', 'What would happen if you tried it once?',
      'أي مرضى بالضبط؟', 'شنو اللي يمنعك؟',
    ]) expect(analyzeRepTurn(q).specifyingQuestion, q).toBe(true)
  })
  it('does not flag statements or ordinary questions', () => {
    expect(analyzeRepTurn('Our product is exactly what you need.').specifyingQuestion).toBe(false)
    expect(analyzeRepTurn('Do you have time today?').specifyingQuestion).toBe(false)
  })
  it('warms the doctor and asks for one concrete detail', () => {
    const shape = analyzeRepTurn('Which patients, specifically?')
    expect(repTurnToDelta(shape).trustDelta).toBeGreaterThan(0)
    const prompt = buildDoctorReplyPrompt(createEmptySession('s1', 'r1'), 'Which patients, specifically?', shape, state)
    expect(prompt).toContain('answer with one concrete detail')
  })
  it('only makes the doctor speak in general terms on the harder difficulties', () => {
    const s = createEmptySession('s1', 'r1')
    const shape = analyzeRepTurn('Hello.')
    s.difficulty = 'realistic'
    expect(buildDoctorReplyPrompt(s, 'Hello.', shape, state)).not.toContain('Voice objections in general terms first')
    s.difficulty = 'resistant'
    expect(buildDoctorReplyPrompt(s, 'Hello.', shape, state)).toContain('Voice objections in general terms first')
    s.difficulty = 'pressure_test'
    expect(buildDoctorOpeningPrompt(s, state)).toContain('Voice objections in general terms first')
  })
})
