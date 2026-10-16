import type { Knowledge } from './core'

/** Meanings are reviewed communication references, never patient-specific clinical facts. */
export function medicalContext(matches: Knowledge[]) {
  return {
    terms: matches.filter(e => e.kind === 'medical' || e.kind === 'pharmacy').map(e => ({
      term: e.expression, contextualMeaning: e.contextual_meaning, specialty: e.specialty,
      source: e.source_reference, uncertainty: e.uncertainty, knowledgeId: e.id, version: e.version,
    })),
    clinicalRecommendations: [] as string[],
    boundary: 'Term recognition does not validate a medical claim or authorize a treatment decision.',
  }
}
