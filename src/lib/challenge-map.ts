import type { StyleKey } from '@/types/game'
import type { Competency } from '@/schemas/observation'
import type { ObjectionType } from '@/lib/voice-partner-core'

/**
 * How each recurring "hurt" behavior is practised. Pure data: the engine decides
 * WHICH behavior to work on from the rep's history; this table only says what a
 * good exercise for it looks like. It never touches scoring weights.
 */
export interface ChallengeTarget {
  /** Micro-practice drill to try first (a drill id from drill-templates). */
  drillId: string
  /** Drill to use instead when the pattern clusters with a given physician style. */
  drillByStyle?: Partial<Record<StyleKey, string>>
  /** Objection the targeted simulation raises, so the situation that triggers the behavior comes up. */
  objectionType: ObjectionType
  /** Physician style used when the history shows no clear style for this behavior. */
  defaultStyle: StyleKey
  competency: Competency
  /** What the rep practises, in plain English (becomes the learning objective). */
  objective: string
  /** The doctor's main concern in the targeted simulation. Generic: no clinical claims. */
  concern: string
}

export const CHALLENGE_MAP: Record<string, ChallengeTarget> = {
  leading_question: { drillId: 'precision-questioning-1', objectionType: 'doubt', defaultStyle: 'analytical', competency: 'questioning',
    objective: 'Ask open questions without steering the doctor toward your answer.', concern: 'Wants to explain their own view before hearing a pitch' },
  forbidden_question: { drillId: 'needs-discovery-1', objectionType: 'indifference', defaultStyle: 'amiable', competency: 'questioning',
    objective: 'Ask what matters for the doctor\'s patients, not why they prescribe what they do.', concern: 'Dislikes being questioned about their prescribing habits' },
  interruption: { drillId: 'clarification-1', objectionType: 'true_objection', defaultStyle: 'driver', competency: 'active_listening',
    objective: 'Let the doctor finish before you respond.', concern: 'Has a long, specific concern and wants it heard in full' },
  premature_pitch: { drillId: 'needs-discovery-1', objectionType: 'indifference', defaultStyle: 'driver', competency: 'discovery',
    objective: 'Understand the doctor\'s situation before presenting anything.', concern: 'Has little time and no interest in a product pitch' },
  product_first_opening: { drillId: 'opening-1', objectionType: 'indifference', defaultStyle: 'driver', competency: 'discovery',
    objective: 'Open with the doctor\'s patients, not with the product.', concern: 'Is busy and expects the rep to start from their patients' },
  accepted_vague_objection: { drillId: 'precision-questioning-1', objectionType: 'doubt', defaultStyle: 'analytical', competency: 'discovery',
    objective: 'Ask what a vague objection means before you move on.', concern: 'Gives a vague objection and waits to see whether it is explored' },
  style_mismatch: { drillId: 'difficult-analytical-1', drillByStyle: { driver: 'resistant-driver-1' }, objectionType: 'doubt', defaultStyle: 'analytical', competency: 'adaptation',
    objective: 'Match your pace and depth to this doctor\'s style.', concern: 'Wants the conversation to fit how they work' },
  ignored_objection: { drillId: 'objection-exploration-1', objectionType: 'true_objection', defaultStyle: 'analytical', competency: 'objection_handling',
    objective: 'Acknowledge and explore every objection before moving on.', concern: 'Raises a real objection and watches whether it is heard' },
  argued_with_doctor: { drillId: 'competitor-challenge-1', objectionType: 'true_objection', defaultStyle: 'driver', competency: 'objection_handling',
    objective: 'Explore the doctor\'s reason instead of countering it.', concern: 'Is satisfied with the current treatment and says so firmly' },
  used_but_contradiction: { drillId: 'objection-exploration-1', objectionType: 'doubt', defaultStyle: 'amiable', competency: 'objection_handling',
    objective: 'Acknowledge a concern without undoing it with "but".', concern: 'Has a doubt and notices when it is brushed aside' },
  generic_claim: { drillId: 'buying-signal-1', objectionType: 'indifference', defaultStyle: 'expressive', competency: 'value_communication',
    objective: 'Tie what you say to what this doctor told you they care about.', concern: 'Tunes out broad claims that are not about their patients' },
  unsupported_claim: { drillId: 'evidence-response-1', objectionType: 'doubt', defaultStyle: 'analytical', competency: 'value_communication',
    objective: 'Support claims with approved evidence, or say you will follow up.', concern: 'Challenges any claim that is not backed by evidence' },
  hedged_delivery: { drillId: 'resistant-driver-1', objectionType: 'indifference', defaultStyle: 'driver', competency: 'value_communication',
    objective: 'Deliver your key points without hedges and fillers.', concern: 'Has no patience for vague or uncertain delivery' },
  no_next_step: { drillId: 'commitment-closing-1', objectionType: 'indifference', defaultStyle: 'expressive', competency: 'closing',
    objective: 'End every conversation with a clear, agreed next step.', concern: 'Is positive but non-committal' },
  premature_close: { drillId: 'commitment-closing-1', objectionType: 'doubt', defaultStyle: 'amiable', competency: 'closing',
    objective: 'Cover the doctor\'s concern before you ask for a commitment.', concern: 'Has a concern that must be settled before agreeing to anything' },
}
