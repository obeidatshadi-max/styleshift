import type { Knowledge } from './core'

/** Reports lexical evidence separately from interpretations. A quote/question may contain a concern
 * without asserting it, so phrase matches alone never become an observed adoption objection. */
export function communicationContext(original: string, matches: Knowledge[]) {
  return {
    observations: matches.filter(e => e.kind === 'workflow').map(e => ({
      type: 'expression_present' as const, evidence: e.expression, utterance: original, knowledgeId: e.id,
    })),
    hypotheses: matches.filter(e => e.kind === 'workflow').map(e => ({
      possibleConcern: e.contextual_meaning, uncertainty: e.uncertainty,
      requiresSpeakerConfirmation: true, source: e.source_reference,
    })),
    personalityInferences: [] as string[],
    hiddenMotives: [] as string[],
  }
}
