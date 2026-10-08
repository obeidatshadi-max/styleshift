import { describe, it, expect } from 'vitest'
import type { Competency, Observation } from '@/schemas/observation'
import { scoreSession } from './engine'
import { behaviorIndex, defaultScoringConfig, parseScoringConfig } from './config'

function obs(competency: Competency, behavior: string, confidence = 1): Observation {
  return { competency, behavior, observation: 'o', evidence: [{ turnIndex: 1, role: 'rep', quote: 'q' }], timestamp: null, direction: 'positive', confidence }
}
const NOW = new Date('2026-09-19T00:00:00Z')
const score = (o: Observation[], d: Parameters<typeof scoreSession>[1] = 'realistic', cfg = defaultScoringConfig) => scoreSession(o, d, cfg, NOW)

describe('user-specified point values', () => {
  const cases: [Competency, string, number][] = [
    ['questioning', 'open_question', 5],
    ['discovery', 'clarification', 7],
    ['active_listening', 'paraphrasing', 8],
    ['active_listening', 'interruption', -6],
    ['objection_handling', 'ignored_objection', -8],
    ['discovery', 'premature_pitch', -5],
  ]
  it.each(cases)('%s / %s applies %i points from the 50 base', (competency, behavior, points) => {
    expect(score([obs(competency, behavior)]).competencies[competency as 'questioning'].score).toBe(50 + points)
  })
  it('marks exactly those six as source=user', () => {
    const user = [...behaviorIndex(defaultScoringConfig).entries()].filter(([, v]) => v.rule.source === 'user').map(([k]) => k).sort()
    expect(user).toEqual(['clarification', 'ignored_objection', 'interruption', 'open_question', 'paraphrasing', 'premature_pitch'])
  })
})

describe('scoreSession', () => {
  it('returns null (not a guess) with no evidence, and null overall when nothing scored', () => {
    const s = score([])
    expect(s.overall).toBeNull()
    expect(s.coverage).toBe(0)
    expect(s.competencies.questioning).toMatchObject({ score: null, reason: 'insufficient_evidence' })
  })

  it('scales by confidence and ignores observations below minConfidence', () => {
    expect(score([obs('active_listening', 'paraphrasing', 0.5)]).competencies.active_listening.score).toBe(54) // 50 + 8*.5
    expect(score([obs('active_listening', 'paraphrasing', 0.2)]).competencies.active_listening.score).toBeNull()
  })

  it('decays repeats of the SAME behavior but not different behaviors', () => {
    const same = score([obs('discovery', 'clarification'), obs('discovery', 'clarification')]).competencies.discovery.score
    expect(same).toBe(62)   // 50 + 7 + 7*.75 = 62.25
    const diff = score([obs('discovery', 'clarification'), obs('discovery', 'need_uncovered')]).competencies.discovery.score
    expect(diff).toBe(65)   // 50 + 7 + 8
  })

  it('combines positives and negatives in one competency', () => {
    const s = score([obs('active_listening', 'paraphrasing'), obs('active_listening', 'interruption')]).competencies.active_listening
    expect(s.score).toBe(52) // 50 + 8 - 6
    expect(s.contributions.map(c => c.direction).sort()).toEqual(['negative', 'positive'])
  })

  it('rewards positives more on harder difficulty and leaves negatives alone', () => {
    const p = (d: 'supportive' | 'pressure_test') => score([obs('adaptation', 'style_matched')], d).competencies.adaptation.score!
    expect(p('pressure_test')).toBeGreaterThan(p('supportive'))
    const n = (d: 'supportive' | 'pressure_test') => score([obs('adaptation', 'style_mismatch')], d).competencies.adaptation.score
    expect(n('supportive')).toBe(n('pressure_test'))
  })

  it('clamps to 0-100', () => {
    const many = Array.from({ length: 40 }, () => obs('objection_handling', 'ignored_objection'))
    expect(score(many, 'realistic', { ...defaultScoringConfig, repeatDecay: 1 }).competencies.objection_handling.score).toBe(0)
  })

  it('ignores behaviors filed under the wrong competency, unknown keys, and communication_clarity', () => {
    const s = score([obs('closing', 'open_question'), obs('questioning', 'made_up'), obs('communication_clarity', 'long_turn')])
    expect(s.overall).toBeNull()
    expect(s.competencies).not.toHaveProperty('communication_clarity')
  })

  it('computes overall as a weight-normalized mean of scored competencies only', () => {
    // questioning w1 -> 55, objection_handling w1.5 -> 56: (55 + 56*1.5)/2.5 = 55.6 -> 56
    const s = score([obs('questioning', 'open_question'), obs('objection_handling', 'objection_acknowledged')])
    expect(s.overall).toBe(56)
    expect(s.coverage).toBeCloseTo(0.29, 2)
  })

  it('is deterministic', () => {
    const input = [obs('questioning', 'open_question'), obs('discovery', 'clarification', 0.7)]
    expect(score(input)).toEqual(score(input))
  })

  it('a config edit changes the result with no code change', () => {
    const cfg = parseScoringConfig(JSON.parse(JSON.stringify({ ...defaultScoringConfig, pointScale: 2 })))
    expect(score([obs('questioning', 'open_question')], 'realistic', cfg).competencies.questioning.score).toBe(60)
    const edited = JSON.parse(JSON.stringify(defaultScoringConfig))
    edited.competencies.questioning.behaviors.open_question.points = 12
    expect(score([obs('questioning', 'open_question')], 'realistic', parseScoringConfig(edited)).competencies.questioning.score).toBe(62)
  })

  it('records contributions with evidence turns for explainability', () => {
    const c = score([obs('questioning', 'open_question')]).competencies.questioning.contributions[0]
    expect(c).toMatchObject({ behavior: 'open_question', direction: 'positive', points: 5, evidenceTurns: [1] })
  })
})

describe('parseScoringConfig', () => {
  const clone = () => JSON.parse(JSON.stringify(defaultScoringConfig))
  it('accepts the shipped config', () => expect(defaultScoringConfig.version).toBe('1.0.0'))
  it('rejects bad edits loudly', () => {
    expect(() => parseScoringConfig({ ...clone(), repeatDecay: 0 })).toThrow(/repeatDecay/)
    expect(() => parseScoringConfig({ ...clone(), baseScore: 500 })).toThrow(/baseScore/)
    expect(() => parseScoringConfig(null)).toThrow(/Invalid scoring config/)
    const missing = clone(); delete missing.competencies.closing
    expect(() => parseScoringConfig(missing)).toThrow(/closing/)
    const zero = clone(); zero.competencies.questioning.behaviors.open_question.points = 0
    expect(() => parseScoringConfig(zero)).toThrow(/non-zero/)
    const dup = clone(); dup.competencies.closing.behaviors.open_question = { points: 3, source: 'proposed', description: 'x' }
    expect(() => parseScoringConfig(dup)).toThrow(/more than one competency/)
  })
})
