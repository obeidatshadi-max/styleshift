import { retrieve, type Knowledge, type Region } from './core'

export type Feedback = { id: string; text: string; region: Region }
/** Aggregate only supplied feedback; counts describe this sample, never Iraqi market prevalence.
 * Pure function: caller controls consent, retention, and de-identification; no DB writes. */
export function summarizeFeedback(feedback: Feedback[], knowledge: Knowledge[]) {
  const groups = new Map<string, { knowledgeId: string; version: number; expression: string;
    possibleIssue: string; source: string; uncertainty: string; feedbackIds: Set<string> }>()
  for (const item of feedback.slice(0, 500)) {
    for (const entry of retrieve(item.text, knowledge, item.region).filter(e => e.kind === 'workflow')) {
      const group = groups.get(entry.id) ?? { knowledgeId: entry.id, version: entry.version,
        expression: entry.expression, possibleIssue: entry.contextual_meaning,
        source: entry.source_reference, uncertainty: entry.uncertainty, feedbackIds: new Set<string>() }
      group.feedbackIds.add(item.id); groups.set(entry.id, group)
    }
  }
  return {
    sampleSize: new Set(feedback.slice(0, 500).map(f => f.id)).size,
    recurringCandidates: [...groups.values()].filter(g => g.feedbackIds.size >= 2).map(g => ({
      ...g, feedbackIds: [...g.feedbackIds], count: g.feedbackIds.size,
    })),
    limitation: 'Lexical recurrence in supplied feedback only. Confirm speaker intent; not a verified market finding or prevalence estimate.',
  }
}
