import { describe, it, expect } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { analyzeRepTurn, repTurnToDelta } from './behavior'
import { buildDoctorReplyPrompt } from './prompt'
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
  it('a patient-first opening and a criteria question warm the doctor; forbidden questions and "but" cool it', () => {
    const warm = repTurnToDelta(analyzeRepTurn('What challenges do your patients face with their current treatment?', first))
    const cold = repTurnToDelta(analyzeRepTurn('Why do you prescribe that one?', first))
    expect(warm.engagementDelta).toBeGreaterThan(cold.engagementDelta)
    expect(warm.trustDelta).toBeGreaterThan(0)
    expect(cold.trustDelta).toBeLessThan(0)
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
    expect(prompt).toContain('guarded and vague')
    expect(prompt).not.toMatch(/forbidden|mistake|should have/i)
  })
})
