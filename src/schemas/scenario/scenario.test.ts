import { describe, expect, it } from 'vitest'
import { toEngineSetup, validateSimScenario, SIM_DIFFICULTIES } from '@/schemas/scenario'
import { DIFFICULTY_LEVELS } from '@/lib/voice-partner-core'

const valid = () => ({
  name: 'Skeptical cardiologist, new statin',
  therapeuticArea: 'Cardiovascular',
  physician: { specialty: 'cardiology', seniority: 'consultant', style: 'analytical', relationshipStage: 'early', adoptionAttitude: 'cautious' },
  mainConcerns: ['Long-term safety data'],
  visitPurpose: 'Introduce the product to a first-time prescriber',
  learningObjectives: ['Ask before pitching'],
  expectedCompetencies: ['discovery', 'objection_handling'],
  difficulty: 'skeptical',
  language: 'en',
  availableTimeMin: 5,
  requiredObjections: [{ type: 'doubt', text: null }],
  optionalObjections: [{ type: 'indifference' }],
  scoringCriteria: [{ behavior: 'premature_pitch', emphasis: 'focus' }],
})

describe('validateSimScenario', () => {
  it('accepts a complete scenario and fills defaults', () => {
    const res = validateSimScenario(valid())
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.description).toBe('')
      expect(res.value.arabicVariant).toBeNull()
      expect(res.value.hiddenConcern).toBeNull()
    }
  })

  it('reports every problem at once, with paths', () => {
    const res = validateSimScenario({ ...valid(), name: '', difficulty: 'easy', physician: { ...valid().physician, style: 'x' }, availableTimeMin: 0 })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.join('\n')).toMatch(/name: is required/)
      expect(res.errors.join('\n')).toMatch(/difficulty: must be one of/)
      expect(res.errors.join('\n')).toMatch(/physician\.style/)
      expect(res.errors.join('\n')).toMatch(/availableTimeMin/)
    }
  })

  it('rejects a scoring criterion that is not in the scoring catalog', () => {
    const res = validateSimScenario({ ...valid(), scoringCriteria: [{ behavior: 'made_up_behavior', emphasis: 'focus' }] })
    expect(res.ok).toBe(false)
  })

  it('defaults Arabic scenarios to Iraqi and rejects a variant on English ones', () => {
    const ar = validateSimScenario({ ...valid(), language: 'ar' })
    expect(ar.ok && ar.value.arabicVariant).toBe('iraqi')
    const en = validateSimScenario({ ...valid(), arabicVariant: 'msa' })
    expect(en.ok).toBe(false)
  })

  it('does not allow an optional objection to repeat a required type', () => {
    const res = validateSimScenario({ ...valid(), optionalObjections: [{ type: 'doubt' }] })
    expect(res.ok).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(validateSimScenario(null).ok).toBe(false)
    expect(validateSimScenario([]).ok).toBe(false)
  })
})

describe('toEngineSetup', () => {
  it('maps every trainer difficulty onto an existing engine difficulty', () => {
    for (const d of SIM_DIFFICULTIES) {
      const setup = toEngineSetup({ difficulty: d, language: 'en', arabicVariant: null })
      expect(DIFFICULTY_LEVELS).toContain(setup.difficulty)
    }
  })

  it('runs "skeptical" as realistic plus a skepticism bias, and leaves others unbiased', () => {
    expect(toEngineSetup({ difficulty: 'skeptical', language: 'en', arabicVariant: null })).toMatchObject({ difficulty: 'realistic', skepticismBias: 0.15 })
    expect(toEngineSetup({ difficulty: 'resistant', language: 'en', arabicVariant: null }).skepticismBias).toBe(0)
  })

  it('keeps Iraqi as the Arabic default and drops the variant for English', () => {
    expect(toEngineSetup({ difficulty: 'normal', language: 'ar', arabicVariant: null }).arabicVariant).toBe('iraqi')
    expect(toEngineSetup({ difficulty: 'normal', language: 'en', arabicVariant: 'iraqi' }).arabicVariant).toBeNull()
  })
})
