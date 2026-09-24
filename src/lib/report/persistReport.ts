import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationReport, ReportSessionType } from '@/schemas/conversationReport'

export async function persistReport(
  supabase: SupabaseClient, report: ConversationReport,
  sessionType: ReportSessionType, sessionId: string, repId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.from('conversation_reports').insert({
    session_type: sessionType,
    session_id: sessionId,
    rep_id: repId,
    transcript_version: report.transcriptVersion,
    report_schema_version: report.reportSchemaVersion,
    scoring_config_version: report.scoringConfigVersion,
    report,
    status: 'complete',
  }).select('id').single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' }

  // Mark any prior report for this session with an OLDER transcript version
  // as superseded — the report UI (Task 14) checks superseded_by to show
  // the "outdated" banner. A report with the SAME transcript_version being
  // regenerated is a separate case (retry after failure) and is not marked.
  await supabase.from('conversation_reports')
    .update({ superseded_by: data.id })
    .eq('session_type', sessionType).eq('session_id', sessionId)
    .lt('transcript_version', report.transcriptVersion)

  return { ok: true, id: data.id }
}
