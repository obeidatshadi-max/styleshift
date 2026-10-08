// src/lib/report/adapters/fromCustomerVisit.ts
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'
import type { TranscriptSegmentRow } from './fromRoleplaySession'

export interface CustomerVisitRow {
  objective: string | null
  product_context: string | null
  retention_policy: 'discard_after_report' | 'retain_90_days' | 'retain_indefinite'
}

export function adaptCustomerVisit(
  rows: TranscriptSegmentRow[], visit: CustomerVisitRow,
): { segments: TranscriptSegment[]; context: ReportContext } {
  const segments: TranscriptSegment[] = rows.map(r => ({
    segmentIndex: r.segment_index,
    speakerRole: r.speaker_role,
    text: r.text,
    startMs: r.start_ms,
    endMs: r.end_ms,
    createdAt: null,
  }))
  const context: ReportContext = {
    objective: visit.objective,
    productContext: visit.product_context,
    isSimulation: false,
    simulationPersona: null,
    savedCounterpartStyle: null, // no prior recorded profile for a real customer exists yet
    deterministicMetrics: {},
    qualityFlags: rows.length < 10 ? ['short_session'] : [],
  }
  return { segments, context }
}
