import {
  CERTAINTIES, COMMITMENT_STATUSES, OBJECTIVE_STATUSES, PERFORMANCE_DIMENSIONS, SIGNAL_CATEGORIES, SOCIAL_STYLES,
  type TranscriptSegment, type ReportContext, type SocialStyleSignal,
} from '@/schemas/conversationReport'
import { CONTEXT_COACHING_RULES } from '@/lib/context-coaching'
import { VAGUE_PATTERNS, patternPromptList } from '@/lib/precision-language'

const oneOf = (values: readonly string[]) => values.map(v => `"${v}"`).join(' | ')

/** The exact JSON shape groundReport() reads. The model is never shown this
 * implicitly — without it, it invents its own field names (e.g. "priority"
 * for coachingPriority.behavior) and the whole report is discarded as
 * ungrounded. Enum lists come from the schema constants so they can't drift. */
const EV = '{ "segmentIndex": <number>, "speakerRole": "rep"|"counterpart" }'
const SHAPE_FIELDS = {
  momentUnderstanding: `  "momentUnderstanding": { "evidence": ${EV}, "possibleMeanings": [string], "missingContext": string, "clarifyingQuestion": string, "subsequentResponse": ${EV}|null }|null`,
  vagueStatements: `  "vagueStatements": [{ "evidence": ${EV}, "pattern": ${oneOf(VAGUE_PATTERNS)}, "precisionQuestion": string }]`,
  visitSummary: `  "visitSummary": { "summary": string, "objectiveStatus": ${oneOf(OBJECTIVE_STATUSES)}, "objectiveStatusReason": string, "evidence": [${EV}] }`,
  customerUnderstanding: `  "customerUnderstanding": {
    "needs": [{ "text": string, "certainty": ${oneOf(CERTAINTIES)}, "evidence": [${EV}] }],
    "concerns": [same item shape], "decisionCriteria": [same item shape], "openQuestions": [same item shape]
  }`,
  performance: `  "performance": [{ "dimension": ${oneOf(PERFORMANCE_DIMENSIONS)}, "whatHappened": string, "whyItMattered": string, "improvement": string|null, "evidence": [${EV}] }]`,
  criticalMoments: `  "criticalMoments": [{ "observedBehavior": string, "interpretation": string, "interpretationCertainty": ${oneOf(CERTAINTIES)}, "betterResponseExample": string|null, "evidence": ${EV} }]`,
  commitments: `  "commitments": [{ "action": string, "status": ${oneOf(COMMITMENT_STATUSES)}, "owner": string|null, "date": string|null, "evidence": [${EV}] }]`,
  coachingPriority: `  "coachingPriority": { "behavior": string, "betterPhrase": string, "practiceExercise": string, "successLooksLike": string, "evidence": [${EV}] }`,
  strength: `  "strength": { "behavior": string, "evidence": [${EV}] }`,
  socialStyle: `  "socialStyle": {
    "customer": { "possibleStyle": ${oneOf(SOCIAL_STYLES)}|null, "strongestSignals": [{ "category": ${oneOf(SIGNAL_CATEGORIES)}, "evidence": ${EV} }], "mixedEvidenceNote": string|null, "alternativeExplanation": string|null },
    "rep": { same shape as "customer" },
    "adaptation": [{ "customerSignal": ${EV}, "repResponse": ${EV}, "assessment": "well_adapted"|"mismatched"|"insufficient_evidence", "betterResponseExample": string|null, "suggestedAdjustment": string|null }],
    "signalChanges": [{ "description": string, "evidence": [${EV}] }],
    "coachingCard": { "observedSignals": string, "possiblePreference": string, "evidenceAndAlternative": string, "repResponse": string, "mostUsefulAdjustment": string, "suggestedWordingNextVisit": string }|null
  }`,
} as const

/** The report is generated as several small model calls run in parallel. One long
 * completion exceeded the host's synchronous function time limit (504), and in
 * Arabic (far more tokens per word) even half a report was cut off at the token
 * cap. The parts are merged before grounding, so groundReport() still sees one object. */
export const REPORT_PARTS = ['summary', 'moments', 'coaching', 'style'] as const
export type ReportPart = typeof REPORT_PARTS[number] | 'all'
export type ReportLang = 'en' | 'ar'

const PART_KEYS: Record<ReportPart, (keyof typeof SHAPE_FIELDS)[]> = {
  summary: ['visitSummary', 'customerUnderstanding', 'commitments'],
  moments: ['performance', 'criticalMoments', 'momentUnderstanding', 'vagueStatements'],
  coaching: ['coachingPriority', 'strength'],
  style: ['socialStyle'],
  all: ['visitSummary', 'customerUnderstanding', 'performance', 'criticalMoments', 'momentUnderstanding', 'vagueStatements', 'commitments', 'coachingPriority', 'strength', 'socialStyle'],
}
/** Merge the parts' parsed JSON, taking from each only the keys that part was asked for. A part
 * can echo another part's key (the objective line mentions visitSummary, so the coaching part
 * added a stray `"visitSummary": "..."` string) and must never overwrite the real one. */
export function mergeReportParts(parsed: Partial<Record<ReportPart, Record<string, unknown>>>): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const part of REPORT_PARTS) {
    const source = parsed[part]
    if (!source) continue
    for (const key of PART_KEYS[part]) if (key in source) merged[key] = source[key]
  }
  return merged
}

const SHAPES = Object.fromEntries((Object.keys(PART_KEYS) as ReportPart[]).map(part =>
  [part, '{\n' + PART_KEYS[part].map(key => SHAPE_FIELDS[key]).join(',\n') + '\n}'])) as Record<ReportPart, string>

const LANGUAGE_RULE: Record<ReportLang, string> = {
  en: 'Write every free-text field in English.',
  ar: 'Write every free-text field in Arabic (clear Modern Standard Arabic, natural for a pharmaceutical sales rep in Iraq). ' +
    'Keep drug and product names, numbers and units as given. JSON keys and enumerated values (such as "partial" or "inferred") stay in English exactly as listed below. ' +
    'Every field typed "string" is free text and MUST be Arabic, including "behavior", "whatHappened", "whyItMattered", "improvement", "interpretation", ' +
    '"practiceExercise", "successLooksLike", "mostUsefulAdjustment" and "summary"; never answer a free-text field in English. ' +
    'Example wording for a rep to say ("betterPhrase", "betterResponseExample", "suggestedWordingNextVisit", "clarifyingQuestion", "precisionQuestion") may use natural Iraqi dialect.',
}

/** Suggested wording is the one place the model can put words in the rep's mouth. A rep who
 * repeats an invented efficacy claim to a doctor is a compliance problem, so no suggested
 * phrase may state product results, comparative benefit or outcomes — only ask, acknowledge,
 * or offer to bring the company's approved evidence. */
const NO_CLAIMS_RULE = 'In every suggested phrase or example wording for the rep, NEVER assert what the product does or achieves: no efficacy, speed of effect, ' +
  'comparison with another treatment, safety, or patient-outcome statements, even generic ones such as "faster improvement" or "better control". ' +
  'The transcript is not evidence for such a claim. Instead acknowledge the doctor\'s point, ask a question, or offer to bring the approved evidence ' +
  '(for example "I can bring you the approved data on this point") — never describe what that data shows.'

export const SYSTEM = 'You are an objective sales-conversation analyst, not a clinician. ' +
  'You write evidence-based reports for a medical sales rep about their own conversation. ' +
  'Never invent a quote, a score, a date, an owner, an agreement, a hidden emotion, or a fact ' +
  'not present in the transcript. Never present a simulated persona\'s configuration as real ' +
  'customer information. Never invent clinical data, efficacy numbers, or real/branded drug names. ' +
  'When evidence is insufficient, say so explicitly rather than guessing. ' +
  'Output ONLY a single valid JSON object, no markdown fences, no commentary. ' + CONTEXT_COACHING_RULES

function formatSegments(segments: TranscriptSegment[]): string {
  return segments.map(s => `[${s.segmentIndex}] ${s.speakerRole}: ${s.text}`).join('\n')
}

function formatSignals(label: string, signals: SocialStyleSignal[]): string {
  if (signals.length === 0) return `${label}: none detected.`
  return `${label}:\n` + signals.map(s => `- [${s.evidence.segmentIndex}] (${s.category}) "${s.text}"`).join('\n')
}

/** Structure of Magic I (pp. 40-66): counterpart statements left vague that the rep did not make specific. */
const VAGUE_RULE = `For vagueStatements, list at most 3 counterpart statements that were left vague in one of these ways AND that the rep's very next turn did not ask to make specific (the rep answered, pitched or moved on instead). Cite only the counterpart's actual segment, never a rep statement. Choose the one pattern that fits best:
${patternPromptList()}
For each, write one short, respectful precisionQuestion the rep could have asked, using the counterpart's own words. Return [] when the rep did follow up, or when nothing the counterpart said was meaningfully vague. Do not use hidden simulation configuration as evidence.`

const REQUIRED_NOTE: Record<ReportPart, string> = {
  all: 'coachingPriority and visitSummary.summary are required and coachingPriority needs at least one evidence reference.',
  summary: 'visitSummary.summary is required.',
  moments: '',
  coaching: 'coachingPriority is required and needs at least one evidence reference.',
  style: '',
}

export function buildReportPrompt(
  segments: TranscriptSegment[], context: ReportContext,
  counterpartSignals: SocialStyleSignal[], repSignals: SocialStyleSignal[] = [], part: ReportPart = 'all', lang: ReportLang = 'en',
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

Return a single JSON object in EXACTLY this shape${part === 'all' ? '' : ' (just these top-level keys; the rest of the report is produced separately)'}. Use these exact field names — a report with
renamed or missing fields is discarded. ${REQUIRED_NOTE[part]} criticalMoments: max 5. Use [] or null when
there is nothing supported by the transcript.
Keep it compact: every string at most 2 short sentences; at most 3 items in each list; at most 2 evidence
references per item; at most 3 performance items; at most 3 strongestSignals per style read. Fewer,
well-supported items beat many weak ones.
${SHAPES[part]}

${part === 'moments' || part === 'all' ? `For momentUnderstanding, choose ONE ambiguous counterpart statement worth clarifying. Cite the counterpart's actual segment; never a rep statement. Give one or two tentative possibleMeanings, explicitly framed as possibilities, not established motives. State the missingContext and suggest one short, respectful clarifyingQuestion. Set subsequentResponse only to the first actual counterpart response after an intervening rep turn, if present; it is historical evidence, NOT a predicted response to your suggested question. Return null when no useful supported moment exists. Do not use hidden simulation configuration as evidence. Keep each field to one short sentence.

${VAGUE_RULE}` : ''}

For every piece of evidence, cite ONLY { "segmentIndex": <number>, "speakerRole": "rep"|"counterpart" } —
do NOT include the quoted text yourself; the exact words will be looked up separately from the real
transcript by segmentIndex. A segmentIndex that does not appear in the transcript above will be discarded.

For socialStyle, ground every "possibleStyle" claim in one or more of the listed detected signals via
their segmentIndex — do not assign a style with no matching signal. Use null / "insufficient evidence"
freely; do not force a style onto ambiguous or contradictory signals.

In every text field, never write segment numbers or bracketed references such as [3] — the app shows the
evidence itself; refer to moments in words ("when the doctor asked about interactions").

${LANGUAGE_RULE[lang]}

${NO_CLAIMS_RULE}

Never claim one behavior caused a reaction merely because it came first in the transcript.`

  // The moments part also lists vagueStatements, so it gets a little more room (Arabic runs long).
  return { system: SYSTEM, prompt, maxTokens: part === 'all' ? 4000 : part === 'moments' ? 2600 : 2200 }
}
