import type { SessionRecord } from '@/agents/orchestrator/types'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'
import { isSocialStyle } from '@/schemas/conversationReport'

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
    objective: null, // this flow has no rep-entered visit objective field today
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
  return { segments, context }
}
