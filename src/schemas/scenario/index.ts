import type { Specialty } from '@/types/game'
import { SPECIALTY_ORDER } from '@/lib/game-data'
import { COMPETENCIES, type Competency } from '@/schemas/observation'
import { OBJECTION_TYPES, type Difficulty, type ObjectionType } from '@/lib/voice-partner-core'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { asRecord, finish, Reader, type ValidationResult } from '@/schemas/validation'

/**
 * A reusable AI-Doctor simulation configuration, authored by a trainer/manager
 * as STRUCTURED DATA. No scenario logic lives in UI components: the runner
 * reads this object (via toEngineSetup) and the existing doctor agent does
 * the rest. Distinct from `company_scenarios`, which are multiple-choice
 * objection drills.
 */

export const SIM_DIFFICULTIES = ['receptive', 'normal', 'skeptical', 'resistant', 'pressure_test'] as const
export type SimDifficulty = typeof SIM_DIFFICULTIES[number]

export const SENIORITIES = ['resident', 'specialist', 'consultant', 'professor', 'head_of_department'] as const
export type Seniority = typeof SENIORITIES[number]

export const RELATIONSHIP_STAGES = ['new', 'early', 'established', 'strained', 'advocate'] as const
export type RelationshipStage = typeof RELATIONSHIP_STAGES[number]

export const ADOPTION_ATTITUDES = ['enthusiastic', 'open', 'neutral', 'cautious', 'opposed'] as const
export type AdoptionAttitude = typeof ADOPTION_ATTITUDES[number]

export const SCENARIO_LANGUAGES = ['en', 'ar'] as const
export type ScenarioLanguage = typeof SCENARIO_LANGUAGES[number]

/** Only meaningful when language is 'ar'. Iraqi is its own value so it is never
 * silently replaced by Levantine/MSA phrasing. */
export const ARABIC_VARIANTS = ['iraqi', 'msa'] as const
export type ArabicVariant = typeof ARABIC_VARIANTS[number]

export const SCENARIO_STATUSES = ['draft', 'approved', 'archived'] as const
export type ScenarioStatus = typeof SCENARIO_STATUSES[number]

const SOCIAL_STYLE_KEYS = ['driver', 'expressive', 'amiable', 'analytical'] as const

export interface ObjectionSpec {
  type: ObjectionType
  /** Optional trainer wording the doctor should lean on. */
  text: string | null
}

export interface ScoringEmphasis {
  /** Key from the scoring catalog (scoring.config.json). */
  behavior: string
  emphasis: 'focus' | 'normal'
}

export interface SimScenario {
  name: string
  description: string
  therapeuticArea: string
  /** Links to a knowledge pack; clinical content comes only from there. */
  knowledgePackId: string | null
  productName: string | null
  physician: {
    specialty: Specialty
    seniority: Seniority
    style: typeof SOCIAL_STYLE_KEYS[number]
    relationshipStage: RelationshipStage
    adoptionAttitude: AdoptionAttitude
  }
  mainConcerns: string[]
  hiddenConcern: string | null
  competitorSituation: string | null
  patientPopulation: string | null
  visitPurpose: string
  learningObjectives: string[]
  expectedCompetencies: Competency[]
  difficulty: SimDifficulty
  language: ScenarioLanguage
  arabicVariant: ArabicVariant | null
  availableTimeMin: number
  desiredNextStep: string | null
  requiredObjections: ObjectionSpec[]
  optionalObjections: ObjectionSpec[]
  scoringCriteria: ScoringEmphasis[]
  coachInstructions: string | null
}

/** A stored scenario (row shape). */
export interface SimScenarioRecord extends SimScenario {
  id: string
  companyId: string
  status: ScenarioStatus
  createdBy: string
  createdAt: string
}

function readObjections(r: Reader, key: string): ObjectionSpec[] {
  const raw = r.raw(key)
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) { r.fail(key, 'must be a list'); return [] }
  return raw.flatMap((item, i) => {
    const rec = asRecord(item)
    if (!rec) { r.fail(`${key}[${i}]`, 'must be an object'); return [] }
    const sub = new Reader(rec, `${key}[${i}]`)
    const spec = { type: sub.oneOf('type', OBJECTION_TYPES), text: sub.optStr('text', { max: 300 }) }
    r.errors.push(...sub.errors)
    return [spec]
  })
}

export function validateSimScenario(input: unknown): ValidationResult<SimScenario> {
  const rec = asRecord(input)
  if (!rec) return { ok: false, errors: ['scenario must be an object'] }
  const r = new Reader(rec)
  const ph = r.obj('physician')

  const language = r.oneOf('language', SCENARIO_LANGUAGES)
  let arabicVariant = r.optOneOf('arabicVariant', ARABIC_VARIANTS)
  if (language === 'ar' && !arabicVariant) arabicVariant = 'iraqi'
  if (language === 'en' && arabicVariant) r.fail('arabicVariant', 'only applies when language is "ar"')

  const catalog = behaviorIndex(defaultScoringConfig)
  const criteria: ScoringEmphasis[] = []
  const rawCriteria = r.raw('scoringCriteria')
  if (Array.isArray(rawCriteria)) {
    rawCriteria.forEach((item, i) => {
      const sub = new Reader(asRecord(item) ?? {}, `scoringCriteria[${i}]`)
      const behavior = sub.str('behavior', { max: 80 })
      if (behavior && !catalog.has(behavior)) sub.fail('behavior', `"${behavior}" is not in the scoring catalog`)
      criteria.push({ behavior, emphasis: sub.oneOf('emphasis', ['focus', 'normal'] as const, 'normal') })
      r.errors.push(...sub.errors)
    })
  } else if (rawCriteria !== undefined) r.fail('scoringCriteria', 'must be a list')

  const required = readObjections(r, 'requiredObjections')
  const optional = readObjections(r, 'optionalObjections')
  const requiredTypes = new Set(required.map(o => o.type))
  if (optional.some(o => requiredTypes.has(o.type))) r.fail('optionalObjections', 'must not repeat a required objection type')

  const value: SimScenario = {
    name: r.str('name', { max: 120 }),
    description: r.optStr('description', { max: 1000 }) ?? '',
    therapeuticArea: r.str('therapeuticArea', { max: 120 }),
    knowledgePackId: r.optStr('knowledgePackId', { max: 64 }),
    productName: r.optStr('productName', { max: 120 }),
    physician: {
      specialty: ph.oneOf('specialty', SPECIALTY_ORDER as readonly Specialty[]),
      seniority: ph.oneOf('seniority', SENIORITIES),
      style: ph.oneOf('style', SOCIAL_STYLE_KEYS),
      relationshipStage: ph.oneOf('relationshipStage', RELATIONSHIP_STAGES),
      adoptionAttitude: ph.oneOf('adoptionAttitude', ADOPTION_ATTITUDES),
    },
    mainConcerns: r.strList('mainConcerns', { min: 1, max: 6, itemMax: 300 }),
    hiddenConcern: r.optStr('hiddenConcern', { max: 300 }),
    competitorSituation: r.optStr('competitorSituation', { max: 500 }),
    patientPopulation: r.optStr('patientPopulation', { max: 300 }),
    visitPurpose: r.str('visitPurpose', { max: 300 }),
    learningObjectives: r.strList('learningObjectives', { min: 1, max: 6, itemMax: 300 }),
    expectedCompetencies: r.enumList('expectedCompetencies', COMPETENCIES, { min: 1 }),
    difficulty: r.oneOf('difficulty', SIM_DIFFICULTIES),
    language,
    arabicVariant,
    availableTimeMin: r.int('availableTimeMin', 1, 60),
    desiredNextStep: r.optStr('desiredNextStep', { max: 300 }),
    requiredObjections: required,
    optionalObjections: optional,
    scoringCriteria: criteria,
    coachInstructions: r.optStr('coachInstructions', { max: 1000 }),
  }
  r.errors.push(...ph.errors)
  return finish(r, value)
}

export interface EngineSetup {
  difficulty: Difficulty
  /** Added to the doctor's starting skepticism (0-1 scale) on top of the engine's own seed. */
  skepticismBias: number
  lang: ScenarioLanguage
  arabicVariant: ArabicVariant | null
}

/**
 * Maps the trainer-facing 5-level difficulty onto the engine's 4 levels
 * WITHOUT changing the engine enum (it is baked into DB CHECK constraints
 * and saved sessions). "skeptical" has no engine twin: it runs as
 * "realistic" plus a skepticism bias.
 */
export function toEngineSetup(s: Pick<SimScenario, 'difficulty' | 'language' | 'arabicVariant'>): EngineSetup {
  const map: Record<SimDifficulty, { difficulty: Difficulty; skepticismBias: number }> = {
    receptive: { difficulty: 'supportive', skepticismBias: 0 },
    normal: { difficulty: 'realistic', skepticismBias: 0 },
    skeptical: { difficulty: 'realistic', skepticismBias: 0.15 },
    resistant: { difficulty: 'resistant', skepticismBias: 0 },
    pressure_test: { difficulty: 'pressure_test', skepticismBias: 0 },
  }
  return { ...map[s.difficulty], lang: s.language, arabicVariant: s.language === 'ar' ? (s.arabicVariant ?? 'iraqi') : null }
}
