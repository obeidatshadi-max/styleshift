export const REPORT_SESSION_TYPES = ['human_partner', 'ai_doctor_voice', 'ai_doctor_text', 'customer_visit'] as const
export type ReportSessionType = typeof REPORT_SESSION_TYPES[number]
export function isReportSessionType(v: unknown): v is ReportSessionType {
  return typeof v === 'string' && (REPORT_SESSION_TYPES as readonly string[]).includes(v)
}

export const CERTAINTIES = ['stated', 'inferred', 'not_established'] as const
export type Certainty = typeof CERTAINTIES[number]
export function isCertainty(v: unknown): v is Certainty {
  return typeof v === 'string' && (CERTAINTIES as readonly string[]).includes(v)
}

export const COMMITMENT_STATUSES = ['agreed', 'proposed', 'ai_recommended'] as const
export type CommitmentStatus = typeof COMMITMENT_STATUSES[number]
export function isCommitmentStatus(v: unknown): v is CommitmentStatus {
  return typeof v === 'string' && (COMMITMENT_STATUSES as readonly string[]).includes(v)
}

export const OBJECTIVE_STATUSES = ['achieved', 'partial', 'not_achieved', 'insufficient_evidence'] as const
export type ObjectiveStatus = typeof OBJECTIVE_STATUSES[number]
export function isObjectiveStatus(v: unknown): v is ObjectiveStatus {
  return typeof v === 'string' && (OBJECTIVE_STATUSES as readonly string[]).includes(v)
}

export const SOCIAL_STYLES = ['driver', 'expressive', 'amiable', 'analytical'] as const
export type SocialStyle = typeof SOCIAL_STYLES[number]
export function isSocialStyle(v: unknown): v is SocialStyle {
  return typeof v === 'string' && (SOCIAL_STYLES as readonly string[]).includes(v)
}

export const PERFORMANCE_DIMENSIONS = [
  'opening', 'questioning', 'listening', 'value_linking',
  'evidence_use', 'objection_handling', 'adaptation', 'closing',
] as const
export type PerformanceDimension = typeof PERFORMANCE_DIMENSIONS[number]
export function isPerformanceDimension(v: unknown): v is PerformanceDimension {
  return typeof v === 'string' && (PERFORMANCE_DIMENSIONS as readonly string[]).includes(v)
}

export const VOICE_METRICS = [
  'speaking_share', 'speaking_rate', 'pitch_variation', 'pauses',
  'rapid_turn_switches', 'question_frequency', 'open_question_ratio',
] as const
export type VoiceMetric = typeof VOICE_METRICS[number]

export const SIGNAL_CATEGORIES = [
  'directness', 'detail_request', 'results_focus', 'relationship_language',
  'possibility_interest', 'reassurance_request', 'pace_preference',
] as const
export type SignalCategory = typeof SIGNAL_CATEGORIES[number]
export function isSignalCategory(v: unknown): v is SignalCategory {
  return typeof v === 'string' && (SIGNAL_CATEGORIES as readonly string[]).includes(v)
}

export interface TranscriptSegment {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'
  text: string
  startMs: number | null
  endMs: number | null
  createdAt: string | null
}

/** `quote` is checked server-side (groundReport.ts) to be a real substring
 * of segments[segmentIndex].text. Never trust a model-supplied EvidenceRef
 * without that check. */
export interface EvidenceRef {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'
  quote: string
}

export interface VisitSummary {
  sessionType: ReportSessionType
  objective: string | null
  summary: string
  objectiveStatus: ObjectiveStatus
  objectiveStatusReason: string
  evidence: EvidenceRef[]
}

export interface CustomerUnderstandingItem {
  text: string
  certainty: Certainty
  evidence: EvidenceRef[]
}

export interface CustomerUnderstanding {
  needs: CustomerUnderstandingItem[]
  concerns: CustomerUnderstandingItem[]
  decisionCriteria: CustomerUnderstandingItem[]
  openQuestions: CustomerUnderstandingItem[]
}

export interface PerformanceFinding {
  dimension: PerformanceDimension
  whatHappened: string
  evidence: EvidenceRef[]
  whyItMattered: string
  improvement: string | null
}

export interface CriticalMoment {
  evidence: EvidenceRef
  observedBehavior: string
  interpretation: string
  interpretationCertainty: Certainty
  betterResponseExample: string | null
}

export interface VoiceMeasurement {
  metric: VoiceMetric
  value: number
  unit: string
  explanation: string
  available: boolean
}

export interface Commitment {
  action: string
  status: CommitmentStatus
  owner: string | null
  date: string | null
  evidence: EvidenceRef[]
}

export interface CoachingPriority {
  behavior: string
  evidence: EvidenceRef[]
  betterPhrase: string
  practiceExercise: string
  successLooksLike: string
}

export interface Strength {
  behavior: string
  evidence: EvidenceRef[]
}

export interface SocialStyleSignal {
  text: string
  evidence: EvidenceRef
  category: SignalCategory
}

export interface SocialStyleRead {
  subject: 'customer' | 'rep'
  strongestSignals: SocialStyleSignal[]
  possibleStyle: SocialStyle | null
  mixedEvidenceNote: string | null
  alternativeExplanation: string | null
  savedProfile: SocialStyle | null
  profileDrift: boolean
  isSimulationSetting: boolean
}

export interface AdaptationFinding {
  customerSignal: EvidenceRef
  repResponse: EvidenceRef
  assessment: 'well_adapted' | 'mismatched' | 'insufficient_evidence'
  betterResponseExample: string | null
  suggestedAdjustment: string | null
}

export interface SocialStyleSection {
  customer: SocialStyleRead
  rep: SocialStyleRead
  adaptation: AdaptationFinding[]
  signalChanges: { description: string; evidence: EvidenceRef[] }[]
  coachingCard: {
    observedSignals: string
    possiblePreference: string
    evidenceAndAlternative: string
    repResponse: string
    mostUsefulAdjustment: string
    suggestedWordingNextVisit: string
  } | null
}

export interface ConversationReport {
  reportSchemaVersion: 1
  sessionType: ReportSessionType
  transcriptVersion: number
  scoringConfigVersion: string | null
  generatedAt: string
  visitSummary: VisitSummary
  customerUnderstanding: CustomerUnderstanding
  performance: PerformanceFinding[]
  criticalMoments: CriticalMoment[]
  voiceMeasurements: VoiceMeasurement[]
  commitments: Commitment[]
  coachingPriority: CoachingPriority
  strength: Strength
  socialStyle: SocialStyleSection
  qualityFlags: string[]
}

/** Context an adapter builds from the flow's own data, given to the prompt
 * builder alongside the segments. Never re-derived by the model. */
export interface ReportContext {
  objective: string | null
  productContext: string | null
  isSimulation: boolean
  simulationPersona: { style: SocialStyle | null; hiddenConcern: string | null } | null
  savedCounterpartStyle: SocialStyle | null
  deterministicMetrics: Record<string, number | string | boolean | null>
  qualityFlags: string[]
}
