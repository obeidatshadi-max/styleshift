import {
  CERTAINTIES, COMMITMENT_STATUSES, OBJECTIVE_STATUSES, PERFORMANCE_DIMENSIONS, SIGNAL_CATEGORIES, SOCIAL_STYLES,
  type TranscriptSegment, type ReportContext, type SocialStyleSignal,
} from '@/schemas/conversationReport'

const oneOf = (values: readonly string[]) => values.map(v => `"${v}"`).join(' | ')

/** The exact JSON shape groundReport() reads. The model is never shown this
 * implicitly — without it, it invents its own field names (e.g. "priority"
 * for coachingPriority.behavior) and the whole report is discarded as
 * ungrounded. Enum lists come from the schema constants so they can't drift. */
const EV = '{ "segmentIndex": <number>, "speakerRole": "rep"|"counterpart" }'
const OUTPUT_SHAPE = `{
  "visitSummary": { "summary": string, "objectiveStatus": ${oneOf(OBJECTIVE_STATUSES)}, "objectiveStatusReason": string, "evidence": [${EV}] },
  "customerUnderstanding": {
    "needs": [{ "text": string, "certainty": ${oneOf(CERTAINTIES)}, "evidence": [${EV}] }],
    "concerns": [same item shape], "decisionCriteria": [same item shape], "openQuestions": [same item shape]
  },
  "performance": [{ "dimension": ${oneOf(PERFORMANCE_DIMENSIONS)}, "whatHappened": string, "whyItMattered": string, "improvement": string|null, "evidence": [${EV}] }],
  "criticalMoments": [{ "observedBehavior": string, "interpretation": string, "interpretationCertainty": ${oneOf(CERTAINTIES)}, "betterResponseExample": string|null, "evidence": ${EV} }],
  "commitments": [{ "action": string, "status": ${oneOf(COMMITMENT_STATUSES)}, "owner": string|null, "date": string|null, "evidence": [${EV}] }],
  "coachingPriority": { "behavior": string, "betterPhrase": string, "practiceExercise": string, "successLooksLike": string, "evidence": [${EV}] },
  "strength": { "behavior": string, "evidence": [${EV}] },
  "socialStyle": {
    "customer": { "possibleStyle": ${oneOf(SOCIAL_STYLES)}|null, "strongestSignals": [{ "category": ${oneOf(SIGNAL_CATEGORIES)}, "evidence": ${EV} }], "mixedEvidenceNote": string|null, "alternativeExplanation": string|null },
    "rep": { same shape as "customer" },
    "adaptation": [{ "customerSignal": ${EV}, "repResponse": ${EV}, "assessment": "well_adapted"|"mismatched"|"insufficient_evidence", "betterResponseExample": string|null, "suggestedAdjustment": string|null }],
    "signalChanges": [{ "description": string, "evidence": [${EV}] }],
    "coachingCard": { "observedSignals": string, "possiblePreference": string, "evidenceAndAlternative": string, "repResponse": string, "mostUsefulAdjustment": string, "suggestedWordingNextVisit": string }|null
  }
}`

export const SYSTEM = 'You are an objective sales-conversation analyst, not a clinician. ' +
  'You write evidence-based reports for a medical sales rep about their own conversation. ' +
  'Never invent a quote, a score, a date, an owner, an agreement, a hidden emotion, or a fact ' +
  'not present in the transcript. Never present a simulated persona\'s configuration as real ' +
  'customer information. Never invent clinical data, efficacy numbers, or real/branded drug names. ' +
  'When evidence is insufficient, say so explicitly rather than guessing. ' +
  'Output ONLY a single valid JSON object, no markdown fences, no commentary.'

function formatSegments(segments: TranscriptSegment[]): string {
  return segments.map(s => `[${s.segmentIndex}] ${s.speakerRole}: ${s.text}`).join('\n')
}

function formatSignals(label: string, signals: SocialStyleSignal[]): string {
  if (signals.length === 0) return `${label}: none detected.`
  return `${label}:\n` + signals.map(s => `- [${s.evidence.segmentIndex}] (${s.category}) "${s.text}"`).join('\n')
}

export function buildReportPrompt(
  segments: TranscriptSegment[], context: ReportContext,
  counterpartSignals: SocialStyleSignal[], repSignals: SocialStyleSignal[] = [],
): { system: string; prompt: string; maxTokens: number } {
  const objectiveLine = context.objective
    ? `Stated visit objective: ${context.objective}`
    : 'No objective was supplied for this session — do not invent one; say so in visitSummary.'

  const simulationLine = context.isSimulation
    ? `This is a SIMULATION. The counterpart's configured persona (style: ${context.simulationPersona?.style ?? 'unknown'}, ` +
      `hidden concern: ${context.simulationPersona?.hiddenConcern ?? 'none'}) is SIMULATION CONFIGURATION, not customer data. ` +
      'Never describe it as something the customer revealed or that was measured from the conversation.'
    : 'This is a REAL conversation (human colleague or real customer). Do not invent a "hidden concern" or force a style label — insufficient evidence is a valid, expected answer.'

  const prompt = `${objectiveLine}
${simulationLine}
${context.productContext ? `Product context: ${context.productContext}` : ''}

TRANSCRIPT (each line: [segmentIndex] speakerRole: text — "rep" is the sales rep, "counterpart" is the doctor/colleague/customer):
${formatSegments(segments)}

Deterministic measurements already computed (do not recompute or contradict these numbers):
${JSON.stringify(context.deterministicMetrics)}

${formatSignals('Counterpart social-style signals (deterministically detected)', counterpartSignals)}
${formatSignals('Rep social-style signals (deterministically detected)', repSignals)}

Return a single JSON object in EXACTLY this shape. Use these exact field names — a report with
renamed or missing fields is discarded. coachingPriority and visitSummary.summary are required and
coachingPriority needs at least one evidence reference. criticalMoments: max 5. Use [] or null when
there is nothing supported by the transcript.
Keep it compact: every string at most 2 short sentences; at most 3 items in each list; at most 2 evidence
references per item; at most 3 performance items; at most 3 strongestSignals per style read. Fewer,
well-supported items beat many weak ones.
${OUTPUT_SHAPE}

For every piece of evidence, cite ONLY { "segmentIndex": <number>, "speakerRole": "rep"|"counterpart" } —
do NOT include the quoted text yourself; the exact words will be looked up separately from the real
transcript by segmentIndex. A segmentIndex that does not appear in the transcript above will be discarded.

For socialStyle, ground every "possibleStyle" claim in one or more of the listed detected signals via
their segmentIndex — do not assign a style with no matching signal. Use null / "insufficient evidence"
freely; do not force a style onto ambiguous or contradictory signals.

Never claim one behavior caused a reaction merely because it came first in the transcript.`

  return { system: SYSTEM, prompt, maxTokens: 4000 }
}
