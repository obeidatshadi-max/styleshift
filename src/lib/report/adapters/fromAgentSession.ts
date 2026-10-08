import type { SessionRecord } from '@/agents/orchestrator/types'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'
import { isSocialStyle } from '@/schemas/conversationReport'
import { findProhibitedClaimHits, knowledgeSectionFor } from '@/lib/knowledge-pack'

export function adaptAgentSession(record: SessionRecord): { segments: TranscriptSegment[]; context: ReportContext } {
  const { session } = record
  const segments: TranscriptSegment[] = session.transcript.map(t => ({
    segmentIndex: t.turnIndex,
    speakerRole: t.role === 'rep' ? 'rep' : 'counterpart',
    text: t.text,
    startMs: null, // a simulation turn index is not an audio timestamp — never fabricate one
    endMs: null,
    createdAt: t.createdAt,
  }))

  const dominant = session.socialStyle.dominant
  const context: ReportContext = {
    objective: session.learningObjectives?.map(o => o.label).join('; ') || null,
    productContext: null,
    isSimulation: true,
    simulationPersona: {
      style: isSocialStyle(dominant) ? dominant : null,
      hiddenConcern: session.physician.hiddenConcern,
    },
    savedCounterpartStyle: null,
    deterministicMetrics: {
      overallScore: session.scores?.overall ?? null,
      scoringConfigVersion: session.scores?.configVersion ?? null,
    },
    qualityFlags: session.transcript.length < 6 ? ['short_session'] : [],
  }
  const pack = session.knowledge
  if (pack) {
    const analystSection = knowledgeSectionFor(pack, 'analyst', session.lang)
    const coachSection = knowledgeSectionFor(pack, 'coach', session.lang)
    const prohibitedHits = segments
      .filter(s => s.speakerRole === 'rep')
      .flatMap(s => findProhibitedClaimHits(s.text, pack, session.lang).map(h => ({ ...h, segmentIndex: s.segmentIndex })))
    if (analystSection || coachSection || prohibitedHits.length) context.knowledge = { analystSection, coachSection, prohibitedHits }
  }
  return { segments, context }
}
