'use client'
import { useT } from '@/lib/i18n'
import { useSavedReport } from '@/hooks/useSavedReport'
import { ConversationReport } from '@/components/report/ConversationReport'
import PracticeReport from './PracticeReport'

interface Props { sessionId: string; onBack: () => void }

/** A finished text simulation reopened from the history list. Shows the saved
 * report; a simulation whose report was never saved is generated now (the same
 * flow as finishing a simulation) rather than showing a dead end. */
export default function PastSimulation({ sessionId, onBack }: Props) {
  const t = useT()
  const saved = useSavedReport('ai_doctor_text', sessionId)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <button onClick={onBack} style={{ alignSelf:'flex-start', padding:'8px 12px', cursor:'pointer' }}>{t('visit.backToHistory')}</button>
      {saved.status === 'loading' && <div role="status" style={{ padding:16 }}>{t('practice.reportLoading')}</div>}
      {saved.status === 'found' && <ConversationReport report={saved.report} outdated={false} />}
      {(saved.status === 'missing' || saved.status === 'error') && (
        <>
          <div style={{ color:'var(--ink-dim)', fontSize:13, lineHeight:1.5 }}>{t('visit.reportNotSaved')}</div>
          <PracticeReport sessionId={sessionId} sessionType="ai_doctor_text" />
        </>
      )}
    </div>
  )
}
