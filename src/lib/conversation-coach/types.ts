// Conversation Coach: the cue -> response layer added to the existing ConversationReport for recorded
// two-person conversations (rep + doctor). It does not replace any report section and adds no score.
//
// Three kinds of evidence are kept apart everywhere:
//   observed_content  - words in the transcript (a quote, a question, an agreed next step)
//   measured_audio    - a number computed from timing or audio by the app itself (never by the model)
//   interpretation    - a tentative reading of observed content, always with its evidence and uncertainty

export const EVIDENCE_TYPES = ['observed_content', 'measured_audio', 'interpretation'] as const
export type EvidenceType = typeof EVIDENCE_TYPES[number]

/** Strength of the evidence behind a finding. NOT a calibrated probability. */
export const CONFIDENCE_LABELS = ['high', 'medium', 'low', 'insufficient'] as const
export type ConfidenceLabel = typeof CONFIDENCE_LABELS[number]
export function isConfidenceLabel(v: unknown): v is ConfidenceLabel {
  return typeof v === 'string' && (CONFIDENCE_LABELS as readonly string[]).includes(v)
}

export const COACH_DOMAINS = ['structure', 'interaction', 'delivery', 'language', 'pharma_skills', 'style_state'] as const
export type CoachDomain = typeof COACH_DOMAINS[number]
export function isCoachDomain(v: unknown): v is CoachDomain {
  return typeof v === 'string' && (COACH_DOMAINS as readonly string[]).includes(v)
}

/** What the doctor did that the rep had to respond to. */
export const CUE_TYPES = ['concern', 'question', 'evidence_request', 'time_pressure', 'interest', 'practical_issue', 'other'] as const
export type CueType = typeof CUE_TYPES[number]
export function isCueType(v: unknown): v is CueType {
  return typeof v === 'string' && (CUE_TYPES as readonly string[]).includes(v)
}

export const ADDRESSED = ['addressed', 'partly', 'not_addressed', 'unclear'] as const
export type Addressed = typeof ADDRESSED[number]
export function isAddressed(v: unknown): v is Addressed {
  return typeof v === 'string' && (ADDRESSED as readonly string[]).includes(v)
}

export const STAGES = ['opening', 'needs_discovery', 'product_evidence', 'concerns', 'closing'] as const
export type Stage = typeof STAGES[number]

export const QUESTION_TYPES = ['open', 'closed', 'leading', 'follow_up'] as const
export type RepQuestionType = typeof QUESTION_TYPES[number]
export function isRepQuestionType(v: unknown): v is RepQuestionType {
  return typeof v === 'string' && (QUESTION_TYPES as readonly string[]).includes(v)
}

/** A quoted transcript segment with its real times. The quote is always the stored segment text. */
export interface SegmentRef {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'
  quote: string
  /** Seconds from the start of the recording; null when the provider gave no time. */
  startSec: number | null
  endSec: number | null
}

/**
 * One coaching finding. Field names follow the product brief (snake_case) so a stored report reads the same
 * as the specification. Every finding is built by groundCoach(), never copied from the model unchecked.
 */
export interface CoachingFinding {
  id: string
  domain: CoachDomain
  speaker: 'rep' | 'counterpart' | 'both'
  start_time: number | null
  end_time: number | null
  evidence_quote: string | null
  evidence_type: EvidenceType
  observation: string
  interpretation: string | null
  alternative_explanation: string | null
  confidence_label: ConfidenceLabel
  confidence_reason: string
  suggested_response: string | null
  practice_task: string | null
  success_criterion: string | null
  limitations: string[]
}

/** The core of the feature: the doctor's cue, the rep's response, and one thing to practise. */
export interface KeyMoment {
  id: string
  cueType: CueType
  cue: SegmentRef
  response: SegmentRef | null
  addressed: Addressed
  /** The next counterpart segment after the response, when there is one. What happened, not what it means. */
  whatHappenedNext: SegmentRef | null
  finding: CoachingFinding
}

export interface StageResult {
  stage: Stage
  observed: boolean
  evidence: SegmentRef[]
}

export interface ConversationStructure {
  /** The rep said the recording covers only part of the visit. */
  partialRecording: boolean
  stages: StageResult[]
}

export const OPPORTUNITY_KEYS = ['concerns_clarified', 'follow_up_questions', 'listening_summaries', 'next_step_agreed'] as const
export type OpportunityKey = typeof OPPORTUNITY_KEYS[number]

/** "Clarified 2 of 3 identifiable concerns" - with the definition shown next to the numbers. */
export interface OpportunityMeasure {
  key: OpportunityKey
  numerator: number
  /** null when the measure is a plain count with no natural denominator. */
  denominator: number | null
  notApplicable: boolean
  definition: string
}

export interface SpeakerTiming {
  role: 'rep' | 'counterpart'
  talkSec: number
  share: number
  turns: number
  longestTurnSec: number
  longestTurnSegment: number | null
}

/** Computed by the app from segment times and text; the model never supplies these. */
export interface InteractionMeasures {
  available: boolean
  durationSec: number | null
  speakers: SpeakerTiming[]
  speakerChanges: number
  /** Times one speaker started before the other had finished, per the provider's timestamps. Not judged as interruptions. */
  overlaps: number | null
  repQuestions: { total: number; open: number; closed: number; leading: number; followUp: number }
}

export interface DeliveryMeasure {
  key: 'speaking_rate' | 'pauses_and_fillers' | 'pitch_range' | 'intensity'
  available: boolean
  value: number | null
  unit: string
  method: string
}

export interface LanguagePatternCount {
  category: LanguageCategory
  speaker: 'rep' | 'counterpart'
  count: number
  examples: SegmentRef[]
}

export const LANGUAGE_CATEGORIES = [
  'certainty', 'qualification', 'generalization', 'obligation', 'choice', 'risk_concern',
  'evidence_request', 'practical_concern', 'conditional_interest', 'commitment', 'sensory_predicate',
] as const
export type LanguageCategory = typeof LANGUAGE_CATEGORIES[number]

export interface UncertainWord {
  segmentIndex: number
  word: string
  /** Provider-supplied word confidence, 0-1. Never estimated by the app. */
  confidence: number
  kind: 'number' | 'term' | 'word'
  startSec: number | null
}

/** Stored with the recording (roleplay_sessions.rep_metrics.transcriptQuality). Provider data only. */
export interface TranscriptQuality {
  provider: 'assemblyai'
  languageCode: string | null
  audioDurationSec: number | null
  wordCount: number
  /** Words that carried a provider confidence value. 0 means the provider supplied none. */
  wordsWithConfidence: number
  meanConfidence: number | null
  lowConfidenceThreshold: number
  lowConfidenceWords: UncertainWord[]
  /** The transcript version these segment indices refer to. */
  transcriptVersion: number
}

export interface RecordingQuality {
  durationSec: number | null
  /** Short notes the rep sees about what limits this analysis. */
  limitations: string[]
  /** Uncertain words that still appear in the current transcript text. */
  uncertainWords: UncertainWord[]
  /** Speaker-specific analysis is limited (one voice dominates, or roles look unreliable). */
  speakerAttributionLimited: boolean
  transcriptConfidence: 'provider_reported' | 'not_reported'
}

export interface EvidenceClaim {
  segment: SegmentRef
  /** Always 'not_verified' unless an approved reference source was checked. */
  accuracy: 'not_verified' | 'matches_approved_source'
}

export interface ConversationSnapshot {
  mainTopic: string | null
  doctorPriorities: { text: string; evidence: SegmentRef }[]
  repApproach: string | null
  nextStep: { agreed: boolean; text: string | null; evidence: SegmentRef[] }
}

export interface CoachingPriorityPlan {
  behavior: string
  whyItMatters: string
  successCriterion: string
  /** Which key moment to replay for practice; null when none fits. */
  momentId: string | null
}

export interface ConversationCoach {
  version: 1
  /** True when built from a development fixture. The UI must label it and it is never saved. */
  synthetic: boolean
  quality: RecordingQuality
  snapshot: ConversationSnapshot
  keyMoments: KeyMoment[]
  structure: ConversationStructure
  interaction: InteractionMeasures
  delivery: DeliveryMeasure[]
  language: LanguagePatternCount[]
  opportunities: OpportunityMeasure[]
  evidenceClaims: EvidenceClaim[]
  priority: CoachingPriorityPlan | null
  /** Set when the model returned nothing usable: the deterministic sections still show. */
  insufficientEvidence: boolean
}
