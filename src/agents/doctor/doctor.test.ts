import { describe, it, expect, vi } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { analyzeRepTurn, repTurnToDelta } from './behavior'
import { buildDoctorReplyPrompt, DOCTOR_SYSTEM } from './prompt'
import { cleanDoctorReply, createDoctorAgent } from './index'

const long = Array.from({ length: 90 }, () => 'word').join(' ')

describe('analyzeRepTurn / repTurnToDelta', () => {
  it('drains engagement when the rep talks too much', () => {
    const d = repTurnToDelta(analyzeRepTurn(long))
    expect(d.engagementDelta).toBeLessThan(0)
  })
  it('raises engagement on a genuine open question', () => {
    const shape = analyzeRepTurn('How do you usually decide which patients to start on something new?')
    expect(shape.askedOpenQuestion).toBe(true)
    expect(repTurnToDelta(shape).engagementDelta).toBeGreaterThan(0)
  })
  it('recognises Arabic open questions', () => {
    expect(analyzeRepTurn('شلون تختار المرضى؟').askedOpenQuestion).toBe(true)
  })
  it('treats a closed question as only mildly positive', () => {
    const d = repTurnToDelta(analyzeRepTurn('Do you have a minute?'))
    expect(d.engagementDelta).toBeGreaterThanOrEqual(0)
    expect(d.engagementDelta).toBeLessThan(8)
  })
})

describe('prompt guardrails', () => {
  it('forbids revealing style, coaching and scoring', () => {
    expect(DOCTOR_SYSTEM).toMatch(/NEVER name, hint at, or describe your social style/)
    expect(DOCTOR_SYSTEM).toMatch(/NEVER coach/)
    expect(DOCTOR_SYSTEM).toMatch(/NEVER score/)
  })
  it('does not put style names in the persona block', () => {
    const s = createEmptySession('s', 'r')
    s.socialStyle = { ...s.socialStyle, source: 'weighted', primary: 'driver', weights: { driver: 0.7, expressive: 0.1, amiable: 0.1, analytical: 0.1 } }
    const prompt = buildDoctorReplyPrompt(s, 'Hi doctor', analyzeRepTurn('Hi doctor'), { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 })
    const persona = prompt.split('Conversation so far:')[0]
    expect(persona).not.toMatch(/\b(driver|expressive|amiable|analytical)\b/i)
    expect(persona).toMatch(/Control & Achievement/)
  })
})

describe('cleanDoctorReply', () => {
  it('strips labels, fences and wrapping quotes', () => {
    expect(cleanDoctorReply('Doctor: "I have five minutes."')).toBe('I have five minutes.')
    expect(cleanDoctorReply('```\nFine.\n```')).toBe('Fine.')
  })
})

describe('doctor agent', () => {
  it('opens when repText is null and appends one doctor turn', async () => {
    const complete = vi.fn().mockResolvedValue('I am not sure your product is right for my patients.')
    const { respond } = createDoctorAgent(complete)
    const out = await respond(createEmptySession('s', 'r'), { repText: null })
    expect(out?.reply).toMatch(/not sure/)
    expect(out?.patch.transcript).toHaveLength(1)
    expect(out?.patch.transcript?.[0].role).toBe('doctor')
  })

  it('appends rep + doctor turns and lowers engagement after a monologue', async () => {
    const complete = vi.fn().mockResolvedValue('Mm. Go on.')
    const { respond } = createDoctorAgent(complete)
    const out = await respond(createEmptySession('s', 'r'), { repText: long })
    expect(out?.patch.transcript?.map(t => t.role)).toEqual(['rep', 'doctor'])
    expect(out!.state.engagement).toBeLessThan(50)
    expect(complete.mock.calls[0][0].prompt).toMatch(/talked for a very long time|long speech/)
  })

  it('raises engagement after an open question', async () => {
    const { respond } = createDoctorAgent(vi.fn().mockResolvedValue('Good question. Mostly older patients.'))
    const out = await respond(createEmptySession('s', 'r'), { repText: 'What matters most to you when choosing a treatment?' })
    expect(out!.state.engagement).toBeGreaterThan(50)
  })

  it('returns null on model failure and run() throws', async () => {
    const { agent, respond } = createDoctorAgent(vi.fn().mockResolvedValue(null))
    expect(await respond(createEmptySession('s', 'r'), { repText: 'hello' })).toBeNull()
    await expect(agent.run(createEmptySession('s', 'r'), { repText: 'hello' })).rejects.toThrow('doctor_unavailable')
  })

  it('rejects oversized rep input without calling the model', async () => {
    const complete = vi.fn()
    const { respond } = createDoctorAgent(complete)
    expect(await respond(createEmptySession('s', 'r'), { repText: 'x'.repeat(2001) })).toBeNull()
    expect(complete).not.toHaveBeenCalled()
  })
})
