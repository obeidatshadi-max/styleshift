import {
  isCertainty, isCommitmentStatus, isObjectiveStatus, isPerformanceDimension, isSocialStyle, isSignalCategory,
  type ConversationReport, type TranscriptSegment, type ReportContext, type EvidenceRef,
  type ReportSessionType,
} from '@/schemas/conversationReport'

const MIN_QUOTE_CHARS = 3

function normalize(s: string): string {
  return s.toLowerCase().replace(/[‘’“”"'`«»]/g, '').replace(/\s+/g, ' ').trim()
}

/** The only place a quote is ever produced. Ignores any `quote` field the
 * model supplied — resolves the real text from the real segment, or drops
 * the reference entirely. Mirrors src/agents/behaviorAnalyst/ground.ts. */
function groundEvidence(raw: unknown, segments: TranscriptSegment[]): EvidenceRef | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.segmentIndex !== 'number') return null
  const seg = segments.find(s => s.segmentIndex === e.segmentIndex)
  if (!seg) return null
  if (normalize(seg.text).length < MIN_QUOTE_CHARS) return null
  return { segmentIndex: seg.segmentIndex, speakerRole: seg.speakerRole, quote: seg.text }
}

function groundEvidenceList(raw: unknown, segments: TranscriptSegment[]): EvidenceRef[] {
  if (!Array.isArray(raw)) return []
  return raw.map(e => groundEvidence(e, segments)).filter((e): e is EvidenceRef => e !== null)
}

function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback }
function strOrNull(v: unknown): string | null { return typeof v === 'string' && v.length > 0 ? v : null }

export function groundReport(
  raw: unknown, segments: TranscriptSegment[], context: ReportContext,
  opts: { sessionType: ReportSessionType; transcriptVersion: number },
): ConversationReport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // ── Visit summary ──
  const vs = (r.visitSummary && typeof r.visitSummary === 'object' ? r.visitSummary : {}) as Record<string, unknown>
  const objectiveStatus = isObjectiveStatus(vs.objectiveStatus) ? vs.objectiveStatus : 'insufficient_evidence'
  const visitSummary = {
    sessionType: opts.sessionType,
    objective: context.objective, // NEVER taken from the model — only the app-supplied context can set this
    summary: str(vs.summary),
    objectiveStatus: context.objective ? objectiveStatus : ('insufficient_evidence' as const),
    objectiveStatusReason: context.objective ? str(vs.objectiveStatusReason) : 'No objective was supplied for this session.',
    evidence: groundEvidenceList(vs.evidence, segments),
  }
  if (!visitSummary.summary) return null // an unusable response has no summary at all

  // ── Customer understanding ──
  function groundItems(raw: unknown): { text: string; certainty: 'stated' | 'inferred' | 'not_established'; evidence: EvidenceRef[] }[] {
    if (!Array.isArray(raw)) return []
    return raw.map(item => {
      const it = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const evidence = groundEvidenceList(it.evidence, segments)
      const text = str(it.text)
      if (!text || evidence.length === 0) return null
      return { text, certainty: isCertainty(it.certainty) ? it.certainty : 'inferred', evidence }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  }
  const cu = (r.customerUnderstanding && typeof r.customerUnderstanding === 'object' ? r.customerUnderstanding : {}) as Record<string, unknown>
  const customerUnderstanding = {
    needs: groundItems(cu.needs), concerns: groundItems(cu.concerns),
    decisionCriteria: groundItems(cu.decisionCriteria), openQuestions: groundItems(cu.openQuestions),
  }

  // ── Performance findings ──
  const performance = (Array.isArray(r.performance) ? r.performance : []).map(item => {
    const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidenceList(p.evidence, segments)
    const dimension = isPerformanceDimension(p.dimension) ? p.dimension : null
    const whatHappened = str(p.whatHappened)
    if (!dimension || !whatHappened || evidence.length === 0) return null
    return { dimension, whatHappened, evidence, whyItMattered: str(p.whyItMattered), improvement: strOrNull(p.improvement) }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // ── Critical moments (max 5) ──
  const criticalMoments = (Array.isArray(r.criticalMoments) ? r.criticalMoments : []).map(item => {
    const m = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidence(m.evidence, segments)
    if (!evidence) return null
    return {
      evidence, observedBehavior: str(m.observedBehavior),
      interpretation: str(m.interpretation),
      interpretationCertainty: isCertainty(m.interpretationCertainty) ? m.interpretationCertainty : 'inferred',
      betterResponseExample: strOrNull(m.betterResponseExample),
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null).slice(0, 5)

  // ── Commitments — status must be exactly one of the three valid values ──
  const commitments = (Array.isArray(r.commitments) ? r.commitments : []).map(item => {
    const c = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidenceList(c.evidence, segments)
    const status = isCommitmentStatus(c.status) ? c.status : null
    const action = str(c.action)
    if (!status || !action || evidence.length === 0) return null
    return { action, status, owner: strOrNull(c.owner), date: strOrNull(c.date), evidence }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // ── Coaching priority + strength — required; drop the report if unusable ──
  const cp = (r.coachingPriority && typeof r.coachingPriority === 'object' ? r.coachingPriority : {}) as Record<string, unknown>
  const coachingEvidence = groundEvidenceList(cp.evidence, segments)
  if (!str(cp.behavior) || coachingEvidence.length === 0) return null
  const coachingPriority = {
    behavior: str(cp.behavior), evidence: coachingEvidence, betterPhrase: str(cp.betterPhrase),
    practiceExercise: str(cp.practiceExercise), successLooksLike: str(cp.successLooksLike),
  }

  const sf = (r.strength && typeof r.strength === 'object' ? r.strength : {}) as Record<string, unknown>
  const strengthEvidence = groundEvidenceList(sf.evidence, segments)
  const strength = { behavior: str(sf.behavior, 'Not enough evidence to identify a repeatable strength.'), evidence: strengthEvidence }

  // ── Social style ──
  const ss = (r.socialStyle && typeof r.socialStyle === 'object' ? r.socialStyle : {}) as Record<string, unknown>
  function groundStyleRead(raw: unknown, subject: 'customer' | 'rep'): ConversationReport['socialStyle']['customer'] {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const strongestSignals = (Array.isArray(s.strongestSignals) ? s.strongestSignals : []).map(sig => {
      const g = (sig && typeof sig === 'object' ? sig : {}) as Record<string, unknown>
      const evidence = groundEvidence(g.evidence, segments)
      if (!evidence) return null
      return { text: evidence.quote, evidence, category: isSignalCategory(g.category) ? g.category : 'directness' }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
    // A style claim with zero matching signals is forced to null — never a
    // forced label with no evidence behind it.
    const claimedStyle = isSocialStyle(s.possibleStyle) ? s.possibleStyle : null
    const isSim = subject === 'customer' && context.isSimulation
    return {
      subject,
      strongestSignals,
      possibleStyle: strongestSignals.length > 0 ? claimedStyle : null,
      mixedEvidenceNote: strOrNull(s.mixedEvidenceNote),
      alternativeExplanation: strOrNull(s.alternativeExplanation),
      savedProfile: subject === 'customer' && !isSim ? context.savedCounterpartStyle : null,
      profileDrift: subject === 'customer' && !isSim && context.savedCounterpartStyle != null && claimedStyle != null
        ? claimedStyle !== context.savedCounterpartStyle : false,
      isSimulationSetting: isSim,
    }
  }
  // When it's a simulation, the "customer" read is forced to the configured
  // persona style rather than whatever the model claims to have observed —
  // it is configuration, not a discovery, by construction.
  const customerRead = context.isSimulation
    ? { ...groundStyleRead(ss.customer, 'customer'), possibleStyle: context.simulationPersona?.style ?? null, isSimulationSetting: true }
    : groundStyleRead(ss.customer, 'customer')
  const repRead = groundStyleRead(ss.rep, 'rep')

  const adaptation = (Array.isArray(ss.adaptation) ? ss.adaptation : []).map(item => {
    const a = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const customerSignal = groundEvidence(a.customerSignal, segments)
    const repResponse = groundEvidence(a.repResponse, segments)
    if (!customerSignal || !repResponse) return null
    const rawAssessment = a.assessment
    const assessment: 'well_adapted' | 'mismatched' | 'insufficient_evidence' =
      rawAssessment === 'well_adapted' || rawAssessment === 'mismatched' ? rawAssessment : 'insufficient_evidence'
    return { customerSignal, repResponse, assessment, betterResponseExample: strOrNull(a.betterResponseExample), suggestedAdjustment: strOrNull(a.suggestedAdjustment) }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  const signalChanges = (Array.isArray(ss.signalChanges) ? ss.signalChanges : []).map(item => {
    const c = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidenceList(c.evidence, segments)
    const description = str(c.description)
    if (!description || evidence.length === 0) return null
    return { description, evidence }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  const cc = (ss.coachingCard && typeof ss.coachingCard === 'object' ? ss.coachingCard : null) as Record<string, unknown> | null
  const coachingCard = cc && customerRead.strongestSignals.length > 0 ? {
    observedSignals: str(cc.observedSignals), possiblePreference: str(cc.possiblePreference),
    evidenceAndAlternative: str(cc.evidenceAndAlternative), repResponse: str(cc.repResponse),
    mostUsefulAdjustment: str(cc.mostUsefulAdjustment), suggestedWordingNextVisit: str(cc.suggestedWordingNextVisit),
  } : null

  return {
    reportSchemaVersion: 1,
    sessionType: opts.sessionType,
    transcriptVersion: opts.transcriptVersion,
    scoringConfigVersion: typeof context.deterministicMetrics.scoringConfigVersion === 'string' ? context.deterministicMetrics.scoringConfigVersion : null,
    generatedAt: new Date().toISOString(),
    visitSummary, customerUnderstanding, performance, criticalMoments,
    voiceMeasurements: [], // filled in by the caller from deterministic data (Task 12) — the model never supplies these
    commitments, coachingPriority, strength,
    socialStyle: { customer: customerRead, rep: repRead, adaptation, signalChanges, coachingCard },
    qualityFlags: context.qualityFlags,
  }
}
