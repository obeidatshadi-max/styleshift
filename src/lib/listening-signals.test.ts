import { describe, expect, it } from 'vitest'
import { isClarifyRequest, isParaphrase, namesPatientProblem, questionKind, reusedKeyWords } from './listening-signals'
import { analyzeRepTurn, repTurnToDelta } from '@/agents/doctor/behavior'
import { classifyQuestions, type Turn } from './roleplay-core'

const turn = (text: string): Turn => ({ speaker: 'rep', text, start: 0, end: 1, durationMs: 1 } as Turn)

describe('point 1: one question checker, soft open questions count as open', () => {
  it.each([
    'Could you tell me more about your patients?',
    'Can you describe how you choose a treatment?',
    'Doctor, would you share what happens with your elderly patients?',
    'What do your patients struggle with?',
    'ممكن تحكيلي عن مرضاك؟',
  ])('open: %s', text => {
    expect(questionKind(text)).toBe('open')
    expect(classifyQuestions([turn(text)], 'rep').open).toBe(1)
    expect(analyzeRepTurn(text).askedOpenQuestion).toBe(true)
  })
  it.each(['Do you have a minute?', 'Is cost the main problem?', 'Can you prescribe it this week?'])('closed: %s', text => {
    expect(questionKind(text)).toBe('closed')
    expect(analyzeRepTurn(text).askedOpenQuestion).toBe(false)
  })
  it('a statement is not a question', () => {
    expect(questionKind('Our data are strong.')).toBeNull()
    expect(analyzeRepTurn('Our data are strong.').askedQuestion).toBe(false)
  })
})

describe('point 3: "tell me more" is a clarification request, even without "?"', () => {
  it.each(['Tell me more about that.', 'Tell me more', 'What do you mean by difficult?', 'Can you explain more?', 'احكيلي اكثر', 'شنو تقصد؟'])('%s', text => {
    expect(isClarifyRequest(text)).toBe(true)
    expect(questionKind(text)).toBe('open')
    expect(analyzeRepTurn(text).clarifyRequest).toBe(true)
  })
  it('is not triggered by an ordinary statement', () => expect(isClarifyRequest('I will send the study tomorrow.')).toBe(false))
  it('warms the doctor', () => expect(repTurnToDelta(analyzeRepTurn('Tell me more about that.')).engagementDelta).toBeGreaterThan(0))
})

describe('point 2: paraphrase lead-ins', () => {
  it.each([
    'What I understand from your talk is that cost worries you most.',
    'So you are saying your older patients stop because of dizziness.',
    'If I understood you correctly, the main issue is the dose.',
    'In other words, you need proof in elderly patients.',
    'اللي فهمته من كلامك إن السعر هو المشكلة',
    'إذا فهمتك صح، المرضى يوقفون العلاج',
  ])('%s', text => {
    expect(isParaphrase(text)).toBe(true)
    expect(analyzeRepTurn(text).paraphrased).toBe(true)
  })
  it('is not a paraphrase', () => expect(isParaphrase('Our product lowers HbA1c.')).toBe(false))
  it('raises trust more than a plain statement', () => {
    const p = repTurnToDelta(analyzeRepTurn('What I understand is that cost worries you most.'))
    const s = repTurnToDelta(analyzeRepTurn('Cost is important for many doctors.'))
    expect(p.trustDelta).toBeGreaterThan(s.trustDelta)
  })
})

describe('point 4: naming a patient problem later in the talk', () => {
  it('detects it after the opening, not as a criteria question', () => {
    expect(analyzeRepTurn('Many of your diabetic patients stop their insulin because of hypos.').namedPatientProblem).toBe(true)
    expect(analyzeRepTurn('What challenges do your patients face with their current treatment?').namedPatientProblem).toBe(false)
    expect(analyzeRepTurn('Many of your patients struggle with adherence.', { firstRepTurn: true }).namedPatientProblem).toBe(false)
    expect(namesPatientProblem('كثير من مرضاك يوقفون العلاج بسبب الأعراض الجانبية')).toBe(true)
    expect(namesPatientProblem('المرضى بخير')).toBe(false)
  })
  it('raises engagement', () => {
    expect(repTurnToDelta(analyzeRepTurn('Many of your elderly patients forget their evening dose.')).engagementDelta).toBeGreaterThanOrEqual(5)
  })
})

describe('point 6: reusing the doctor key words', () => {
  const doctor = 'My elderly patients get dizziness and then they stop the treatment.'
  it('finds reused key words and ignores filler', () => {
    expect(reusedKeyWords('So the dizziness makes elderly people stop.', doctor).sort()).toEqual(['dizziness', 'elderly'])
    expect(reusedKeyWords('Patients really think about that.', 'Patients really think about this.')).toEqual([])
  })
  it('two or more reused words warm the doctor', () => {
    const withWords = repTurnToDelta(analyzeRepTurn('So the dizziness worries your elderly group.', { lastDoctorText: doctor }))
    const without = repTurnToDelta(analyzeRepTurn('Our product has a good profile.', { lastDoctorText: doctor }))
    expect(withWords.trustDelta).toBeGreaterThan(without.trustDelta)
  })
})

describe('the AI doctor is told how to react', () => {
  const state = { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 }
  const cue = async (text: string, lastDoctorText?: string) => {
    const { buildDoctorReplyPrompt } = await import('@/agents/doctor/prompt')
    const { createEmptySession } = await import('@/schemas/session/factory')
    return buildDoctorReplyPrompt(createEmptySession('s1', 'r1'), text, analyzeRepTurn(text, { lastDoctorText }), state)
  }
  it('confirms or corrects a paraphrase', async () => expect(await cue('What I understand is that cost worries you most.')).toContain('confirm it ("Yes, exactly")'))
  it('says more after "tell me more"', async () => expect(await cue('Tell me more about that.')).toContain('Give one more concrete detail'))
  it('shows interest when a patient problem is named', async () => expect(await cue('Many of your elderly patients forget their evening dose.')).toContain('show interest and ask what their product can actually do'))
  it('feels followed when key words are reused', async () =>
    expect(await cue('So the dizziness worries your elderly group.', 'My elderly patients get dizziness and then they stop.')).toContain('You feel they are following you'))
})
