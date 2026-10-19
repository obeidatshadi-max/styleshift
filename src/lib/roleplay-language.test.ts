import { describe, expect, it } from 'vitest'
import { buildTurns, type Utterance } from './roleplay-core'
import { computeLanguageSignals, andButOnGoal, neededVerdict } from './roleplay-language'

function signals(lines: [string, string][]) {
  const utterances: Utterance[] = lines.map(([speaker, text], i) => ({ speaker, text, start: i * 5000, end: i * 5000 + 4000 }))
  return computeLanguageSignals(buildTurns(utterances), 'A')
}

describe('empathy and paraphrasing', () => {
  it('detects the empathy examples in English', () => {
    const s = signals([
      ['A', 'I can understand what you are saying.'],
      ['B', 'ok'],
      ['A', 'I can feel what you are feeling.'],
      ['B', 'ok'],
      ['A', "I'm with you on this."],
      ['B', 'ok'],
      ['A', 'I do not understand this at all.'],
    ])
    expect(s.empathy.count).toBe(3)
  })

  it('detects Arabic empathy and ignores the partner', () => {
    const s = signals([['A', 'أنا معك دكتور'], ['B', 'I understand you completely'], ['A', 'أفهم ما تقول']])
    expect(s.empathy.count).toBe(2)
  })

  it('counts restating lead-ins as paraphrasing', () => {
    const s = signals([['A', 'So you are saying the price is high?'], ['B', 'yes'], ['A', 'Hello there']])
    expect(s.paraphrasing.count).toBe(1)
  })
})

describe('and vs but', () => {
  it('counts whole words only', () => {
    const s = signals([['A', 'Good and fast, and cheap, but android and butter however']])
    expect(s.andBut).toEqual({ and: 3, but: 2 })
  })

  it('goal is and at least twice as often as but', () => {
    expect(andButOnGoal({ and: 4, but: 2 })).toBe(true)
    expect(andButOnGoal({ and: 3, but: 2 })).toBe(false)
    expect(andButOnGoal({ and: 0, but: 0 })).toBe(true)
  })
})

describe('build on the positive', () => {
  it('counts a built-on and a missed positive remark', () => {
    const s = signals([
      ['B', 'The samples worked well for my patients.'],
      ['A', 'I am glad the samples worked, and that is why I suggest the full course.'],
      ['B', 'The packaging is also excellent.'],
      ['A', 'What is your next appointment?'],
    ])
    expect(s.buildOnPositive).toEqual({ positives: 2, builtOn: 1 })
  })

  it('ignores negated praise', () => {
    const s = signals([['B', 'It is not good at all.'], ['A', 'Tell me more.']])
    expect(s.buildOnPositive.positives).toBe(0)
  })

  it('works in Arabic', () => {
    const s = signals([['B', 'الدواء كلش زين'], ['A', 'يسعدني هذا دكتور']])
    expect(s.buildOnPositive).toEqual({ positives: 1, builtOn: 1 })
  })
})

describe('applied when needed', () => {
  it('counts partner feeling moments and whether the rep answered with empathy', () => {
    const s = signals([
      ['B', 'I am worried about the side effects.'],
      ['A', 'I understand, that must be hard.'],
      ['B', 'I am frustrated with the delivery delays.'],
      ['A', 'We can ship on Monday.'],
      ['B', 'The weather is nice.'],
      ['A', 'I hear you.'],
    ])
    expect(s.empathy.needed).toBe(2)
    expect(s.empathy.met).toBe(1)
    expect(s.empathy.count).toBe(2)
  })

  it('counts concerns as paraphrase moments and judges the next reply', () => {
    const s = signals([
      ['B', 'It is too expensive for my clinic.'],
      ['A', 'So you are saying the price is the main issue?'],
      ['B', 'Not sure it works for my patients.'],
      ['A', 'Let me show the data.'],
    ])
    expect(s.paraphrasing.needed).toBe(2)
    expect(s.paraphrasing.met).toBe(1)
  })

  it('works in Arabic', () => {
    const s = signals([['B', 'أنا قلق من الأعراض'], ['A', 'أتفهم قلقك دكتور']])
    expect(s.empathy).toMatchObject({ needed: 1, met: 1 })
  })

  it('reports no moment when nothing called for the skill', () => {
    const s = signals([['B', 'Hello'], ['A', 'Hi']])
    expect(s.empathy).toMatchObject({ needed: 0, met: 0 })
    expect(neededVerdict(s.empathy.needed, s.empathy.met)).toBe('none')
    expect(neededVerdict(undefined, undefined)).toBe('none')
    expect(neededVerdict(3, 3)).toBe('done')
    expect(neededVerdict(3, 1)).toBe('partly')
    expect(neededVerdict(3, 0)).toBe('missed')
  })
})
