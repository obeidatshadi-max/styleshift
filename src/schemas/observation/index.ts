/** Competencies the Behavior Analyst observes. Extend this list to add more;
 * the analyst prompt and validator both read it, so nothing else changes. */
export const COMPETENCIES = [
  'questioning',
  'active_listening',
  'discovery',
  'communication_clarity',
  'adaptation',
  'objection_handling',
  'value_communication',
  'closing',
] as const
export type Competency = typeof COMPETENCIES[number]

export function isCompetency(value: unknown): value is Competency {
  return typeof value === 'string' && (COMPETENCIES as readonly string[]).includes(value)
}

/** Effect of the observed behavior on the conversation, as visible in the
 * transcript: 'positive' moved the doctor toward engagement/agreement,
 * 'negative' moved them away or missed an opening the doctor gave, 'neutral'
 * had no visible effect. Descriptive only — never advice. */
export const DIRECTIONS = ['positive', 'negative', 'neutral'] as const
export type ObservationDirection = typeof DIRECTIONS[number]

export function isDirection(value: unknown): value is ObservationDirection {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value)
}

/** One verbatim transcript line backing an observation. `quote` is checked
 * server-side to be a real substring of the turn at `turnIndex`. */
export interface EvidenceRef {
  turnIndex: number
  role: 'doctor' | 'rep'
  quote: string
}

export interface Observation {
  competency: Competency
  /** Short label for the specific behavior, e.g. "asked an open question". */
  behavior: string
  /** Neutral description of what happened. Never advice or a verdict. */
  observation: string
  /** Always at least one item — an observation without evidence is dropped. */
  evidence: EvidenceRef[]
  /** ISO time of the first evidence turn (copied from the transcript, never
   * model-authored); null when the transcript has no timestamps. */
  timestamp: string | null
  direction: ObservationDirection
  /** 0-1: how clearly the transcript supports this reading. */
  confidence: number
}
