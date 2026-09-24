import type { TranscriptSegment, ReportContext, SocialStyleSignal } from '@/schemas/conversationReport'

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

Return a single JSON object with these top-level keys: visitSummary, customerUnderstanding, performance,
criticalMoments (max 5), commitments, coachingPriority, strength, socialStyle.

For every piece of evidence, cite ONLY { "segmentIndex": <number>, "speakerRole": "rep"|"counterpart" } —
do NOT include the quoted text yourself; the exact words will be looked up separately from the real
transcript by segmentIndex. A segmentIndex that does not appear in the transcript above will be discarded.

For socialStyle, ground every "possibleStyle" claim in one or more of the listed detected signals via
their segmentIndex — do not assign a style with no matching signal. Use null / "insufficient evidence"
freely; do not force a style onto ambiguous or contradictory signals.

Never claim one behavior caused a reaction merely because it came first in the transcript.`

  return { system: SYSTEM, prompt, maxTokens: 4000 }
}
