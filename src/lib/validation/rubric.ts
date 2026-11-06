import { ADAPTATION_DIMENSIONS, COMPETENCY_DIMENSIONS, type AdaptationDimension, type AdaptationScores, type CompetencyDimension, type CompetencyScores } from '@/lib/session-evaluator'

/** Version of docs/validation/human-rating-rubric.md. Every stored rating records the version it used. */
export const RUBRIC_VERSION = 'hrr-1.0.0'

export const RUBRIC_DOMAINS = [
  'opening', 'questioning', 'active_listening', 'clinical_communication', 'objection_handling',
  'style_adaptation', 'state_adaptation', 'composure', 'closing',
] as const
export type RubricDomain = typeof RUBRIC_DOMAINS[number]

export function isRubricDomain(v: unknown): v is RubricDomain {
  return typeof v === 'string' && (RUBRIC_DOMAINS as readonly string[]).includes(v)
}

interface Mapping { competencies: readonly CompetencyDimension[]; adaptation: readonly AdaptationDimension[] }

/**
 * Which existing evaluator dimensions answer each rubric domain (rubric section 2). No new AI dimension is added.
 * `state_adaptation` and `composure` have no counterpart, so they are rated by humans and left out of AI-human agreement.
 */
export const DOMAIN_MAPPING: Record<RubricDomain, Mapping> = {
  opening: { competencies: ['opening'], adaptation: [] },
  questioning: { competencies: ['questioning', 'discovery'], adaptation: [] },
  active_listening: { competencies: ['listening'], adaptation: [] },
  clinical_communication: { competencies: ['evidence_use', 'value_communication', 'relevance'], adaptation: [] },
  objection_handling: { competencies: ['objection_handling'], adaptation: [] },
  style_adaptation: { competencies: [], adaptation: ADAPTATION_DIMENSIONS },
  state_adaptation: { competencies: [], adaptation: [] },
  composure: { competencies: [], adaptation: [] },
  closing: { competencies: ['closing'], adaptation: [] },
}

/** Domains the AI can be compared on. */
export const AI_COMPARABLE_DOMAINS: readonly RubricDomain[] = RUBRIC_DOMAINS.filter(d => {
  const m = DOMAIN_MAPPING[d]
  return m.competencies.length + m.adaptation.length > 0
})

/**
 * The AI's 0-100 score for one rubric domain: the mean of its evaluator dimensions that have a score.
 * Null when the domain has no counterpart or none of its dimensions was scored. A null is never turned into 0.
 * Averaging dimensions is an assumption; the pilot reports per-dimension results too, so it can be checked.
 */
export function aiDomainScore(domain: RubricDomain, competencies: CompetencyScores | null | undefined, adaptation: AdaptationScores | null | undefined): number | null {
  const m = DOMAIN_MAPPING[domain]
  const values: number[] = []
  for (const dim of m.competencies) { const s = competencies?.[dim]?.score; if (typeof s === 'number' && Number.isFinite(s)) values.push(s) }
  for (const dim of m.adaptation) { const s = adaptation?.[dim]?.score; if (typeof s === 'number' && Number.isFinite(s)) values.push(s) }
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/** Every evaluator dimension must belong to some rubric domain, or the comparison would silently ignore it. */
export function unmappedEvaluatorDimensions(): { competencies: CompetencyDimension[]; adaptation: AdaptationDimension[] } {
  const comp = new Set<CompetencyDimension>(), adapt = new Set<AdaptationDimension>()
  for (const d of RUBRIC_DOMAINS) { DOMAIN_MAPPING[d].competencies.forEach(c => comp.add(c)); DOMAIN_MAPPING[d].adaptation.forEach(a => adapt.add(a)) }
  return {
    competencies: COMPETENCY_DIMENSIONS.filter(c => !comp.has(c)),
    adaptation: ADAPTATION_DIMENSIONS.filter(a => !adapt.has(a)),
  }
}
