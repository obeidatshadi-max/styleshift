import type { ConversationTurn, Doctor } from '@/types/game'
import { resolveDoctorStyleProfile } from '@/lib/session-evaluator'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

export function adaptConversationTurns(turns: ConversationTurn[], doctor: Doctor): { segments: TranscriptSegment[]; context: ReportContext } {
  const segments: TranscriptSegment[] = turns.map(t => ({
    segmentIndex: t.turn_index,
    speakerRole: t.role === 'rep' ? 'rep' : 'counterpart',
    text: t.text,
    startMs: null,
    endMs: null,
    createdAt: t.created_at,
  }))

  const profile = resolveDoctorStyleProfile(doctor)
  const context: ReportContext = {
    objective: doctor.meeting_stage ?? null,
    productContext: doctor.product_context ?? null,
    isSimulation: true,
    simulationPersona: { style: profile.dominant, hiddenConcern: doctor.hidden_concern ?? null },
    savedCounterpartStyle: null,
    deterministicMetrics: {},
    qualityFlags: turns.length < 6 ? ['short_session'] : [],
  }
  return { segments, context }
}
