'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { ConversationReport, ReportSessionType } from '@/schemas/conversationReport'

export type SavedReportState =
  | { status: 'loading' }
  | { status: 'found'; report: ConversationReport }
  | { status: 'missing' }
  | { status: 'error' }

/** The newest complete, non-superseded saved report for one session, if any.
 * `missing` (never generated, or generation failed at the time) is a normal
 * outcome the caller can recover from by generating one; `error` means the
 * lookup itself failed. */
export function useSavedReport(sessionType: ReportSessionType, sessionId: string): SavedReportState {
  const [state, setState] = useState<SavedReportState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (active) setState({ status: 'missing' }); return }
        const { data, error } = await supabase
          .from('conversation_reports')
          .select('report')
          .eq('session_type', sessionType)
          .eq('session_id', sessionId)
          .eq('rep_id', user.id)
          .eq('status', 'complete')
          .is('superseded_by', null)
          .order('created_at', { ascending: false })
          .limit(1)
        if (!active) return
        if (error) { setState({ status: 'error' }); return }
        const report = (data as { report: ConversationReport }[] | null)?.[0]?.report
        setState(report ? { status: 'found', report } : { status: 'missing' })
      } catch {
        if (active) setState({ status: 'error' })
      }
    })()
    return () => { active = false }
  }, [sessionType, sessionId])

  return state
}
