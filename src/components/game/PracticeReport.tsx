'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang, useT } from '@/lib/i18n'
import { ConversationReport } from '@/components/report/ConversationReport'
import type { ConversationReport as Report } from '@/schemas/conversationReport'

interface Props {
  sessionId: string
  sessionType?: 'ai_doctor_text' | 'ai_doctor_voice'
  children?: (report: Report) => React.ReactNode
}

/** A slow generation can hit the host's gateway timeout (504) and succeed on
 * the next try, so transient failures are retried once before the rep sees an
 * error. Only gateway-style statuses retry; 4xx means the request itself is wrong. */
const AUTO_ATTEMPTS = 2
const TRANSIENT_STATUSES = new Set([502, 503, 504])

export default function PracticeReport({ sessionId, sessionType = 'ai_doctor_voice', children }: Props) {
  const t = useT()
  const { lang } = useLang()
  // Read at request time, not a dependency: toggling the language must not regenerate a report.
  const langRef = useRef(lang)
  langRef.current = lang
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setReport(null); setFailed(false)
    const controller = new AbortController()
    // Covers every automatic attempt: one generation can take 30-60s on a slow run.
    const timeout = setTimeout(() => controller.abort(), AUTO_ATTEMPTS * 75000)
    ;(async () => {
      for (let i = 0; i < AUTO_ATTEMPTS; i++) {
        try {
          const res = await fetch('/api/reports/generate', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionType, sessionId, lang: langRef.current }), signal: controller.signal,
          })
          if (res.ok) {
            const data = await res.json()
            if (data.report) { if (active) setReport(data.report); return }
            break
          }
          if (!TRANSIENT_STATUSES.has(res.status)) break // 4xx: retrying the same request cannot help
        } catch {
          if (controller.signal.aborted) break // left the screen, or the overall timeout fired
          // otherwise a dropped connection: fall through and try again
        }
      }
      if (active) setFailed(true)
    })().finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [sessionId, sessionType, attempt])
  if (report) return <><ConversationReport report={report} outdated={false} />{children?.(report)}</>
  return <div role={failed ? 'alert' : 'status'} style={{ padding: 16, lineHeight: 1.6 }}>
    {t(failed ? 'practice.reportFailed' : 'practice.reportLoading')}
    {failed && <button onClick={() => setAttempt(n => n + 1)} style={{ display: 'block', marginTop: 12, padding: 12, cursor: 'pointer' }}>{t('practice.retryReport')}</button>}
  </div>
}
