'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { ConversationReport } from '@/components/report/ConversationReport'
import type { ConversationReport as Report } from '@/schemas/conversationReport'

interface Props {
  sessionId: string
  sessionType?: 'ai_doctor_text' | 'ai_doctor_voice'
  children?: (report: Report) => React.ReactNode
}

export default function PracticeReport({ sessionId, sessionType = 'ai_doctor_voice', children }: Props) {
  const t = useT()
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setReport(null); setFailed(false)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90000)
    fetch('/api/reports/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionType, sessionId }), signal: controller.signal,
    }).then(async res => {
      if (!res.ok) throw new Error('report_failed')
      const data = await res.json()
      if (!data.report) throw new Error('report_missing')
      if (active) setReport(data.report)
    }).catch(() => { if (active) setFailed(true) }).finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [sessionId, sessionType, attempt])
  if (report) return <><ConversationReport report={report} outdated={false} />{children?.(report)}</>
  return <div role={failed ? 'alert' : 'status'} style={{ padding: 16, lineHeight: 1.6 }}>
    {t(failed ? 'practice.reportFailed' : 'practice.reportLoading')}
    {failed && <button onClick={() => setAttempt(n => n + 1)} style={{ display: 'block', marginTop: 12, padding: 12, cursor: 'pointer' }}>{t('practice.retryReport')}</button>}
  </div>
}
