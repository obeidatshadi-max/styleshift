import type { StyleKey } from '@/types/game'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { asRecord, finish, Reader, type LocalText, type ValidationResult } from '@/schemas/validation'

/**
 * Micro-practice drills are DATA. One generic runner plays any template; a new
 * drill is a new template object, not new code. Criteria point at behavior
 * keys from the scoring catalog, so drill scoring reuses the same evidence
 * pipeline as full simulations instead of inventing a parallel one.
 */

export const DRILL_TYPES = [
  'precision_questioning', 'clarification', 'objection_exploration', 'buying_signal_recognition',
  'opening_a_visit', 'needs_discovery', 'evidence_response', 'unsupported_comparison_correction',
  'price_objection', 'safety_concern', 'competitor_challenge', 'commitment_closing',
  'difficult_analytical_doctor', 'resistant_driver_doctor', 'trust_recovery',
] as const
export type DrillType = typeof DRILL_TYPES[number]

export const DRILL_DIFFICULTIES = ['easy', 'standard', 'hard'] as const
export type DrillDifficulty = typeof DRILL_DIFFICULTIES[number]

export const EXPECTED_RESPONSES = ['spoken_statement', 'question', 'short_text', 'choice'] as const
export type ExpectedResponse = typeof EXPECTED_RESPONSES[number]

export interface DrillCriterion {
  /** Behavior key from the scoring catalog. */
  behavior: string
  /** Relative weight (>0). */
  weight: number
  /** If true the drill cannot pass without this behavior. */
  required: boolean
  /** What the rep sees when this criterion was met / missed. */
  metFeedback: LocalText
  missedFeedback: LocalText
}

export interface DrillTemplate {
  id: string
  type: DrillType
  version: number
  objective: LocalText
  difficulty: DrillDifficulty
  languages: Array<'en' | 'ar'>
  /** Physician style the situation is written for; null = style-neutral. */
  physicianStyle: StyleKey | null
  /** The situation / doctor line the rep responds to. */
  prompt: LocalText
  expectedResponse: ExpectedResponse
  /** Target length, 2-5 minutes. */
  durationMin: number
  criteria: DrillCriterion[]
  /** Share of weighted criteria (0-1) needed to pass, on top of all `required` ones. */
  passMark: number
  retry: { maxAttempts: number; hintAfterAttempts: number }
  /** Arabic text native-speaker checked. False = flag for review. */
  arabicReviewed: boolean
}

export interface DrillAttempt {
  drillId: string
  drillVersion: number
  repId: string
  attemptNo: number
  at: string
  /** Behavior keys the (grounded) analysis found in the rep's response. */
  observedBehaviors: string[]
  /** 0-100 weighted score; null when the response could not be assessed. */
  score: number | null
  passed: boolean
  lang: 'en' | 'ar'
}

export function validateDrillTemplate(input: unknown): ValidationResult<DrillTemplate> {
  const rec = asRecord(input)
  if (!rec) return { ok: false, errors: ['drill template must be an object'] }
  const r = new Reader(rec)
  const catalog = behaviorIndex(defaultScoringConfig)

  const languages = r.enumList('languages', ['en', 'ar'] as const, { min: 1 })
  const prompt = r.localText('prompt', { required: true, max: 1500 })
  const objective = r.localText('objective', { required: true, max: 400 })
  for (const lang of languages) {
    if (!prompt[lang]) r.fail('prompt', `missing ${lang} text but "${lang}" is listed in languages`)
    if (!objective[lang]) r.fail('objective', `missing ${lang} text but "${lang}" is listed in languages`)
  }

  const criteria: DrillCriterion[] = []
  const raw = r.raw('criteria')
  if (!Array.isArray(raw) || raw.length === 0) r.fail('criteria', 'needs at least one criterion')
  else {
    const seen = new Set<string>()
    raw.forEach((item, i) => {
      const c = new Reader(asRecord(item) ?? {}, `criteria[${i}]`)
      const behavior = c.str('behavior', { max: 80 })
      if (behavior && !catalog.has(behavior)) c.fail('behavior', `"${behavior}" is not in the scoring catalog`)
      if (seen.has(behavior)) c.fail('behavior', `duplicate criterion "${behavior}"`)
      seen.add(behavior)
      // A negative-points behavior is a thing to AVOID; it cannot be "required".
      const required = c.bool('required', false)
      if (required && (catalog.get(behavior)?.rule.points ?? 1) < 0) c.fail('required', 'a negative behavior cannot be required')
      criteria.push({
        behavior, weight: c.num('weight', 0.1, 10, 1), required,
        metFeedback: c.localText('metFeedback', { max: 400 }), missedFeedback: c.localText('missedFeedback', { max: 400 }),
      })
      r.errors.push(...c.errors)
    })
  }

  const retry = r.obj('retry')
  const maxAttempts = retry.int('maxAttempts', 1, 10, 3)
  const hintAfterAttempts = retry.int('hintAfterAttempts', 1, 10, 2)
  r.errors.push(...retry.errors)

  const value: DrillTemplate = {
    id: r.str('id', { max: 80 }),
    type: r.oneOf('type', DRILL_TYPES),
    version: r.int('version', 1, 10000, 1),
    objective, difficulty: r.oneOf('difficulty', DRILL_DIFFICULTIES),
    languages,
    physicianStyle: r.optOneOf('physicianStyle', ['driver', 'expressive', 'amiable', 'analytical'] as const),
    prompt,
    expectedResponse: r.oneOf('expectedResponse', EXPECTED_RESPONSES),
    durationMin: r.int('durationMin', 2, 5),
    criteria,
    passMark: r.num('passMark', 0.3, 1, 0.6),
    retry: { maxAttempts, hintAfterAttempts },
    arabicReviewed: r.bool('arabicReviewed', false),
  }
  return finish(r, value)
}
