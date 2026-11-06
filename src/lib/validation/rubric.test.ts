import { describe, expect, it } from 'vitest'
import { ADAPTATION_DIMENSIONS, COMPETENCY_DIMENSIONS, type AdaptationScores, type CompetencyScores } from '@/lib/session-evaluator'
import { AI_COMPARABLE_DOMAINS, DOMAIN_MAPPING, RUBRIC_DOMAINS, RUBRIC_VERSION, aiDomainScore, isRubricDomain, unmappedEvaluatorDimensions } from './rubric'

const comp = (scores: Partial<Record<(typeof COMPETENCY_DIMENSIONS)[number], number | null>>): CompetencyScores =>
  Object.fromEntries(COMPETENCY_DIMENSIONS.map(d => [d, { score: scores[d] ?? null, turnRefs: [], rationale: '' }])) as unknown as CompetencyScores
const adapt = (scores: Partial<Record<(typeof ADAPTATION_DIMENSIONS)[number], number | null>>): AdaptationScores =>
  Object.fromEntries(ADAPTATION_DIMENSIONS.map(d => [d, { score: scores[d] ?? null, turnRefs: [], rationale: '' }])) as unknown as AdaptationScores

describe('rubric mapping', () => {
  it('has the nine domains of rubric hrr-1.0.0', () => {
    expect(RUBRIC_VERSION).toBe('hrr-1.0.0')
    expect(RUBRIC_DOMAINS).toHaveLength(9)
    expect(isRubricDomain('composure')).toBe(true)
    expect(isRubricDomain('charisma')).toBe(false)
  })
  it('covers every evaluator dimension, so none is silently ignored (fails if a dimension is added without a decision)', () => {
    expect(unmappedEvaluatorDimensions()).toEqual({ competencies: [], adaptation: [] })
  })
  it('leaves state adaptation and composure without an AI counterpart, and out of AI-human comparison', () => {
    expect(AI_COMPARABLE_DOMAINS).not.toContain('state_adaptation')
    expect(AI_COMPARABLE_DOMAINS).not.toContain('composure')
    expect(AI_COMPARABLE_DOMAINS).toHaveLength(7)
    expect(DOMAIN_MAPPING.state_adaptation).toEqual({ competencies: [], adaptation: [] })
  })
})

describe('aiDomainScore', () => {
  it('averages the dimensions that have a score', () => {
    expect(aiDomainScore('questioning', comp({ questioning: 80, discovery: 60 }), adapt({}))).toBe(70)
    expect(aiDomainScore('clinical_communication', comp({ evidence_use: 90, value_communication: 60, relevance: 30 }), adapt({}))).toBe(60)
  })
  it('skips a dimension that was not scored instead of counting it as 0', () => {
    expect(aiDomainScore('questioning', comp({ questioning: 80, discovery: null }), adapt({}))).toBe(80)
  })
  it('is null when nothing in the domain was scored, and never 0', () => {
    expect(aiDomainScore('closing', comp({}), adapt({}))).toBeNull()
    expect(aiDomainScore('closing', null, null)).toBeNull()
  })
  it('is null for the domains with no AI counterpart, whatever else is scored', () => {
    const all = comp(Object.fromEntries(COMPETENCY_DIMENSIONS.map(d => [d, 90])))
    expect(aiDomainScore('state_adaptation', all, adapt({ pace: 90 }))).toBeNull()
    expect(aiDomainScore('composure', all, adapt({ pace: 90 }))).toBeNull()
  })
  it('style adaptation uses the adaptation dimensions, not the competencies', () => {
    expect(aiDomainScore('style_adaptation', comp({ opening: 10 }), adapt({ pace: 40, warmth: 80 }))).toBe(60)
  })
})
